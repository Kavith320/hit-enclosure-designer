import { TestBed } from '@angular/core/testing';

import { EnclosureStateService } from './enclosure-state.service';
import {
  CURRENT_PROJECT_KEY,
  PROJECT_INDEX_KEY,
  projectDataKey,
  ProjectStoreService,
} from './project-store.service';

/** Simulate a page reload: fresh injector, same localStorage. */
const reload = () => {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({});
  return {
    store: TestBed.inject(ProjectStoreService),
    state: TestBed.inject(EnclosureStateService),
  };
};

describe('ProjectStoreService', () => {
  let store: ProjectStoreService;
  let state: EnclosureStateService;

  beforeEach(() => {
    ({ store, state } = reload());
  });

  it('creates a first project on first run and remembers it', () => {
    expect(store.projects().length).toBe(1);
    expect(store.current()?.name).toBe('Untitled project');
    expect(localStorage.getItem(CURRENT_PROJECT_KEY)).toBe(store.currentId());
    expect(JSON.parse(localStorage.getItem(PROJECT_INDEX_KEY)!).length).toBe(1);
  });

  it('autosaves edits and restores them after a reload', () => {
    state.updateParam('length', 123);
    TestBed.tick();
    store.flush();
    const id = store.currentId()!;
    expect(JSON.parse(localStorage.getItem(projectDataKey(id))!).length).toBe(123);

    const after = reload();
    expect(after.store.currentId()).toBe(id);
    expect(after.state.params().length).toBe(123);
  });

  it('creates blank / example / copy projects without touching the open one', () => {
    state.updateParam('length', 111);
    TestBed.tick();
    const firstId = store.currentId()!;

    store.create('Blank', 'blank');
    expect(state.params().holes).toEqual([]);
    expect(state.params().waterProof).toBeFalse();

    store.create('Example', 'example');
    expect(state.params().holes.length).toBeGreaterThan(0);
    expect(state.params().length).toBe(80);

    store.open(firstId);
    expect(state.params().length).toBe(111);

    store.create('Copy', 'current');
    expect(state.params().length).toBe(111);
    expect(store.projects().length).toBe(4);
  });

  it('opens, renames, duplicates and deletes projects', () => {
    const firstId = store.currentId()!;
    state.updateParam('width', 77);
    TestBed.tick();

    const secondId = store.create('Second', 'example', 'Customer A');
    expect(store.current()?.description).toBe('Customer A');
    expect(state.params().width).toBe(100);

    expect(store.open(firstId)).toBeTrue();
    expect(state.params().width).toBe(77);

    store.rename(secondId, 'Gateway box', 'SKU-42');
    const second = store.projects().find((p) => p.id === secondId)!;
    expect(second.name).toBe('Gateway box');
    expect(second.description).toBe('SKU-42');

    const copyId = store.duplicate(firstId)!;
    expect(store.currentId()).toBe(copyId);
    expect(store.current()?.name).toBe('Untitled project (copy)');
    expect(state.params().width).toBe(77);

    store.remove(copyId);
    expect(store.projects().some((p) => p.id === copyId)).toBeFalse();
    expect(localStorage.getItem(projectDataKey(copyId))).toBeNull();
    // Deleting the open project opens another one.
    expect(store.currentId()).not.toBeNull();
    expect(store.currentId()).not.toBe(copyId);
  });

  it('always keeps one project when the last one is deleted', () => {
    const only = store.currentId()!;
    store.remove(only);
    expect(store.projects().length).toBe(1);
    expect(store.currentId()).not.toBe(only);
  });

  it('imports a project file as a new project', () => {
    const before = store.projects().length;
    store.importProject('From file', { length: 145, waterProof: false });
    expect(store.projects().length).toBe(before + 1);
    expect(store.current()?.name).toBe('From file');
    expect(state.params().length).toBe(145);
    expect(state.params().width).toBe(100);
  });

  it('migrates a legacy single PCB preview into the PCB list', () => {
    store.importProject('Old file', {
      pcbPreview: {
        enabled: true,
        width: 60,
        length: 40,
        thickness: 1.6,
        componentHeight: 9,
        x: 2,
        y: -1,
      },
    });
    expect(state.params().pcbs?.length).toBe(1);
    expect(state.params().pcbs?.[0].width).toBe(60);
    expect(state.params().pcbs?.[0].componentHeight).toBe(9);
  });
});
