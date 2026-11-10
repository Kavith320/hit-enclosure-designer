import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';

import { DEFAULT_PARAMS, type Params, blankParams, cloneParams, mergeParams } from '../params';
import { convertParams } from '../units';
import { EnclosureStateService } from './enclosure-state.service';

/** Metadata shown in the project list. */
export type ProjectMeta = {
  id: string;
  name: string;
  /** Free text: customer, product code, notes... */
  description: string;
  createdAt: number;
  updatedAt: number;
};

export type ProjectTemplate = 'blank' | 'example' | 'current';

export type SaveStatus = 'saved' | 'pending' | 'error' | 'memory';

const PREFIX = 'hit-enclosure:';
export const PROJECT_INDEX_KEY = `${PREFIX}projects`;
export const CURRENT_PROJECT_KEY = `${PREFIX}current-project`;
export const projectDataKey = (id: string) => `${PREFIX}project:${id}`;
/** Written by the previous (session-only) autosave; migrated once. */
const LEGACY_SESSION_KEY = 'easy-enclosure:session-params';

const AUTOSAVE_DELAY_MS = 400;

const newId = (): string => {
  try {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
      return crypto.randomUUID();
    }
  } catch {
    // fall through
  }
  return `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
};

/**
 * Stores any number of enclosure projects in the browser (localStorage) and
 * keeps the open project autosaved. Single-user: there are no accounts, the
 * data lives in this browser profile.
 */
@Injectable({ providedIn: 'root' })
export class ProjectStoreService {
  private readonly state = inject(EnclosureStateService);

  private readonly projectsSignal = signal<ProjectMeta[]>([]);
  readonly currentId = signal<string | null>(null);
  readonly saveStatus = signal<SaveStatus>('saved');

  /** All projects, most recently changed first. */
  readonly projects = computed(() =>
    [...this.projectsSignal()].sort((a, b) => b.updatedAt - a.updatedAt),
  );
  readonly current = computed(
    () => this.projectsSignal().find((p) => p.id === this.currentId()) ?? null,
  );

  private storageOk = true;
  private memory = new Map<string, string>();
  private saveHandle: ReturnType<typeof setTimeout> | null = null;
  private pendingSave: { id: string; params: Params } | null = null;
  /** Params snapshot of what was just loaded, so opening doesn't count as an edit. */
  private loadedJson: string | null = null;

  constructor() {
    this.storageOk = this.probeStorage();
    this.initialise();

    effect(() => {
      const params = this.state.params();
      untracked(() => this.scheduleSave(params));
    });

    if (typeof window !== 'undefined') {
      window.addEventListener('beforeunload', () => this.flush());
    }
  }

  // ---- CRUD ---------------------------------------------------------------

  /** Create a new project and open it. Returns its id. */
  create(name: string, template: ProjectTemplate = 'blank', description = ''): string {
    this.flush();
    const current = this.state.params();
    let params: Params;
    if (template === 'current') {
      params = cloneParams(current);
    } else if (template === 'example') {
      params = cloneParams(DEFAULT_PARAMS);
    } else {
      // Blank box, keeping the user's preferred unit system.
      params = blankParams(
        current.measurementSystem === 'imperial'
          ? convertParams(DEFAULT_PARAMS, 'imperial')
          : cloneParams(DEFAULT_PARAMS),
      );
    }
    return this.insert(name, params, description);
  }

  /** Import params (e.g. from a JSON file) as a new project and open it. */
  importProject(name: string, data: Partial<Params>, description = ''): string {
    this.flush();
    const params = mergeParams(cloneParams(DEFAULT_PARAMS), data);
    return this.insert(name, params, description);
  }

  open(id: string): boolean {
    if (id === this.currentId()) return true;
    const params = this.readParams(id);
    if (!params) return false;
    this.flush();
    this.currentId.set(id);
    this.write(CURRENT_PROJECT_KEY, id);
    this.loadIntoState(params);
    return true;
  }

  rename(id: string, name: string, description?: string): void {
    const trimmed = name.trim();
    this.updateMeta(id, (meta) => ({
      ...meta,
      name: trimmed || meta.name,
      description: description ?? meta.description,
      updatedAt: Date.now(),
    }));
  }

  /** Copy a project (saved state) and open the copy. */
  duplicate(id: string): string | null {
    this.flush();
    const meta = this.projectsSignal().find((p) => p.id === id);
    const params = this.readParams(id);
    if (!meta || !params) return null;
    return this.insert(`${meta.name} (copy)`, params, meta.description);
  }

  /** Delete a project. If it was open, the most recent other one is opened. */
  remove(id: string): void {
    if (this.pendingSave?.id === id) {
      this.cancelPendingSave();
    }
    this.delete(projectDataKey(id));
    const remaining = this.projectsSignal().filter((p) => p.id !== id);
    this.setIndex(remaining);

    if (this.currentId() === id) {
      const next = [...remaining].sort((a, b) => b.updatedAt - a.updatedAt)[0];
      if (next) {
        this.currentId.set(null);
        this.open(next.id);
      } else {
        this.currentId.set(null);
        this.create('Untitled project', 'blank');
      }
    }
  }

  /** Saved params of any project (the open one includes unsaved edits). */
  getParams(id: string): Params | null {
    if (id === this.currentId()) return cloneParams(this.state.params());
    return this.readParams(id);
  }

  /** Write any pending autosave immediately. */
  flush(): void {
    if (!this.pendingSave) return;
    const { id, params } = this.pendingSave;
    this.cancelPendingSave();
    this.persist(id, params);
  }

  // ---- Internals ----------------------------------------------------------

  private initialise(): void {
    const index = this.readJson<ProjectMeta[]>(PROJECT_INDEX_KEY);
    const projects = Array.isArray(index) ? index.filter((p) => p && p.id) : [];
    this.projectsSignal.set(projects);

    if (projects.length === 0) {
      // First run: carry over whatever the old session autosave held.
      const legacy = this.readLegacySession();
      this.insert(
        legacy ? 'Recovered project' : 'Untitled project',
        legacy ?? cloneParams(this.state.params()),
        '',
      );
      return;
    }

    const savedCurrent = this.read(CURRENT_PROJECT_KEY);
    const candidates = [
      savedCurrent,
      ...[...projects].sort((a, b) => b.updatedAt - a.updatedAt).map((p) => p.id),
    ];
    for (const id of candidates) {
      if (!id || !projects.some((p) => p.id === id)) continue;
      const params = this.readParams(id);
      if (params) {
        this.currentId.set(id);
        this.write(CURRENT_PROJECT_KEY, id);
        this.loadIntoState(params);
        return;
      }
    }

    this.insert('Untitled project', cloneParams(this.state.params()), '');
  }

  private insert(name: string, params: Params, description: string): string {
    const id = newId();
    const now = Date.now();
    const meta: ProjectMeta = {
      id,
      name: name.trim() || 'Untitled project',
      description,
      createdAt: now,
      updatedAt: now,
    };
    this.write(projectDataKey(id), JSON.stringify(params));
    this.setIndex([...this.projectsSignal(), meta]);
    this.currentId.set(id);
    this.write(CURRENT_PROJECT_KEY, id);
    this.loadIntoState(params);
    return id;
  }

  private loadIntoState(params: Params): void {
    this.cancelPendingSave();
    this.loadedJson = JSON.stringify(params);
    this.state.setParams(params);
    this.saveStatus.set(this.storageOk ? 'saved' : 'memory');
  }

  private scheduleSave(params: Params): void {
    const id = this.currentId();
    if (!id) return;
    const json = JSON.stringify(params);
    if (json === this.loadedJson) return;
    this.loadedJson = null;

    this.pendingSave = { id, params };
    this.saveStatus.set('pending');
    if (this.saveHandle !== null) clearTimeout(this.saveHandle);
    this.saveHandle = setTimeout(() => this.flush(), AUTOSAVE_DELAY_MS);
  }

  private cancelPendingSave(): void {
    if (this.saveHandle !== null) clearTimeout(this.saveHandle);
    this.saveHandle = null;
    this.pendingSave = null;
  }

  private persist(id: string, params: Params): void {
    if (!this.projectsSignal().some((p) => p.id === id)) return;
    const ok = this.write(projectDataKey(id), JSON.stringify(params));
    this.updateMeta(id, (meta) => ({ ...meta, updatedAt: Date.now() }));
    this.saveStatus.set(!ok ? 'error' : this.storageOk ? 'saved' : 'memory');
  }

  private updateMeta(id: string, fn: (meta: ProjectMeta) => ProjectMeta): void {
    this.setIndex(this.projectsSignal().map((p) => (p.id === id ? fn(p) : p)));
  }

  private setIndex(projects: ProjectMeta[]): void {
    this.projectsSignal.set(projects);
    this.write(PROJECT_INDEX_KEY, JSON.stringify(projects));
  }

  private readParams(id: string): Params | null {
    const data = this.readJson<Partial<Params>>(projectDataKey(id));
    if (!data || typeof data !== 'object') return null;
    return mergeParams(cloneParams(DEFAULT_PARAMS), data);
  }

  private readLegacySession(): Params | null {
    try {
      const raw = sessionStorage.getItem(LEGACY_SESSION_KEY);
      if (!raw) return null;
      sessionStorage.removeItem(LEGACY_SESSION_KEY);
      return mergeParams(cloneParams(DEFAULT_PARAMS), JSON.parse(raw) as Partial<Params>);
    } catch {
      return null;
    }
  }

  // ---- Storage wrappers (fall back to memory if localStorage is blocked) ----

  private probeStorage(): boolean {
    try {
      const key = `${PREFIX}probe`;
      localStorage.setItem(key, '1');
      localStorage.removeItem(key);
      return true;
    } catch {
      return false;
    }
  }

  private read(key: string): string | null {
    if (!this.storageOk) return this.memory.get(key) ?? null;
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  }

  private readJson<T>(key: string): T | null {
    const raw = this.read(key);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }

  private write(key: string, value: string): boolean {
    if (!this.storageOk) {
      this.memory.set(key, value);
      return true;
    }
    try {
      localStorage.setItem(key, value);
      return true;
    } catch {
      return false;
    }
  }

  private delete(key: string): void {
    if (!this.storageOk) {
      this.memory.delete(key);
      return;
    }
    try {
      localStorage.removeItem(key);
    } catch {
      // ignore
    }
  }
}
