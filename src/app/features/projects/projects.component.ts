import {
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  signal,
  ViewChild,
} from '@angular/core';
import { saveAs } from 'file-saver';

import {
  type ProjectMeta,
  ProjectStoreService,
  type ProjectTemplate,
} from '../../core/state/project-store.service';

export const projectFileName = (name: string): string => {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `${slug || 'enclosure'}.json`;
};

/**
 * Current-project header plus a manager dialog to create, open, rename,
 * duplicate, export and delete projects.
 */
@Component({
  selector: 'app-projects',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './projects.component.html',
})
export class ProjectsComponent {
  readonly store = inject(ProjectStoreService);

  @ViewChild('dialog') dialogRef?: ElementRef<HTMLDialogElement>;

  readonly mode = signal<'list' | 'new'>('list');
  readonly search = signal('');
  readonly editingId = signal<string | null>(null);
  readonly confirmDeleteId = signal<string | null>(null);

  // New-project form
  readonly newName = signal('');
  readonly newDescription = signal('');
  readonly newTemplate = signal<ProjectTemplate>('blank');

  // Inline rename of the current project in the header
  readonly renamingCurrent = signal(false);

  readonly filtered = computed(() => {
    const q = this.search().trim().toLowerCase();
    const list = this.store.projects();
    if (!q) return list;
    return list.filter(
      (p) => p.name.toLowerCase().includes(q) || p.description.toLowerCase().includes(q),
    );
  });

  readonly statusText = computed(() => {
    switch (this.store.saveStatus()) {
      case 'pending':
        return 'Saving…';
      case 'error':
        return 'Not saved: browser storage is full or blocked';
      case 'memory':
        return 'Storage blocked: changes are lost on reload';
      default:
        return 'All changes saved';
    }
  });

  openManager(mode: 'list' | 'new' = 'list'): void {
    this.mode.set(mode);
    this.search.set('');
    this.editingId.set(null);
    this.confirmDeleteId.set(null);
    if (mode === 'new') this.resetNewForm();
    const dialog = this.dialogRef?.nativeElement;
    if (dialog && !dialog.open) dialog.showModal();
  }

  closeManager(): void {
    const dialog = this.dialogRef?.nativeElement;
    if (dialog?.open) dialog.close();
  }

  showNewForm(): void {
    this.resetNewForm();
    this.mode.set('new');
  }

  private resetNewForm(): void {
    this.newName.set(`Project ${this.store.projects().length + 1}`);
    this.newDescription.set('');
    this.newTemplate.set('blank');
  }

  createProject(): void {
    this.store.create(this.newName(), this.newTemplate(), this.newDescription().trim());
    this.closeManager();
  }

  openProject(project: ProjectMeta): void {
    this.store.open(project.id);
    this.closeManager();
  }

  startEdit(project: ProjectMeta): void {
    this.confirmDeleteId.set(null);
    this.editingId.set(project.id);
  }

  saveEdit(project: ProjectMeta, name: string, description: string): void {
    this.store.rename(project.id, name, description.trim());
    this.editingId.set(null);
  }

  duplicate(project: ProjectMeta): void {
    this.store.duplicate(project.id);
  }

  askDelete(project: ProjectMeta): void {
    this.editingId.set(null);
    this.confirmDeleteId.set(project.id);
  }

  confirmDelete(project: ProjectMeta): void {
    this.store.remove(project.id);
    this.confirmDeleteId.set(null);
  }

  exportProject(project: ProjectMeta): void {
    const params = this.store.getParams(project.id);
    if (!params) return;
    const blob = new Blob([JSON.stringify(params, null, 2)], { type: 'application/json' });
    saveAs(blob, projectFileName(project.name));
  }

  renameCurrent(name: string): void {
    const current = this.store.current();
    if (current) this.store.rename(current.id, name);
    this.renamingCurrent.set(false);
  }

  sizeOf(project: ProjectMeta): string {
    const p = this.store.getParams(project.id);
    if (!p) return '';
    const unit = p.measurementSystem === 'imperial' ? 'in' : 'mm';
    return `${p.width} × ${p.length} × ${p.height} ${unit}`;
  }

  formatDate(ts: number): string {
    try {
      return new Date(ts).toLocaleString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return '';
    }
  }
}
