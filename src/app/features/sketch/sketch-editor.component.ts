import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  input,
  OnInit,
  output,
  signal,
  ViewChild,
} from '@angular/core';

import type { Surface } from '../../core/enclosure';
import { cleanPolygon, faceFrame, isSelfIntersecting } from '../../core/enclosure/sketch';
import type {
  Params,
  SketchFeature,
  SketchOperation,
  SketchShape,
  SketchSide,
} from '../../core/params';

export type SketchTool = 'move' | 'rectangle' | 'circle' | 'polygon';

type Pt = [number, number];

const SURFACE_LABELS: Record<Surface, string> = {
  front: 'Front',
  back: 'Back',
  left: 'Left',
  right: 'Right',
  bottom: 'Bottom',
  top: 'Lid',
};

/**
 * Modal 2D sketch editor: draw a rectangle, circle or free polygon on one
 * face of the enclosure, set its size numerically, and choose whether it is
 * extruded (added) or cut (removed) and by how much.
 */
@Component({
  selector: 'app-sketch-editor',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './sketch-editor.component.html',
})
export class SketchEditorComponent implements OnInit, AfterViewInit {
  /** Current enclosure params (user units). */
  readonly params = input.required<Params>();
  /** Sketch to edit (a copy is made). */
  readonly sketch = input.required<SketchFeature>();
  /** Index of the sketch being edited, or -1 for a new one. */
  readonly index = input<number>(-1);

  readonly saved = output<SketchFeature>();
  readonly cancelled = output<void>();

  @ViewChild('dialog') dialogRef?: ElementRef<HTMLDialogElement>;
  @ViewChild('canvas') canvasRef?: ElementRef<SVGGElement>;

  readonly surfaces: Surface[] = ['front', 'right', 'back', 'left', 'top', 'bottom'];
  readonly surfaceLabels = SURFACE_LABELS;

  readonly draft = signal<SketchFeature>({} as SketchFeature);
  readonly tool = signal<SketchTool>('rectangle');
  readonly snap = signal(true);
  readonly snapStep = signal(1);
  readonly cursor = signal<Pt | null>(null);

  /** Rectangle / circle being dragged out. */
  readonly dragShape = signal<{ start: Pt; end: Pt } | null>(null);
  /** Polygon points being clicked in (absolute face coordinates). */
  readonly polyPoints = signal<Pt[]>([]);
  private moveStart: { pointer: Pt; x: number; y: number } | null = null;

  readonly unit = computed(() => (this.params().measurementSystem === 'imperial' ? 'in' : 'mm'));

  readonly face = computed(() => faceFrame(this.params(), this.draft().surface));

  /** Padding around the face in the SVG, in face units. */
  readonly margin = computed(() => Math.max(this.face().width, this.face().height) * 0.08);

  readonly viewBox = computed(() => {
    const { width, height } = this.face();
    const m = this.margin();
    return `${-width / 2 - m} ${-height / 2 - m} ${width + m * 2} ${height + m * 2}`;
  });

  /** Grid lines (minor + major) covering the face. */
  readonly gridLines = computed(() => {
    const { width, height } = this.face();
    let step = this.snapStep() > 0 ? this.snapStep() : 1;
    // Keep the grid readable: at most ~120 lines per axis.
    while (Math.max(width, height) / step > 120) step *= 2;
    const lines: { x1: number; y1: number; x2: number; y2: number; major: boolean }[] = [];
    const hw = width / 2;
    const hh = height / 2;
    const majorEvery = 10;
    for (let i = Math.ceil(-hw / step); i * step <= hw + 1e-9; i++) {
      const x = i * step;
      lines.push({ x1: x, y1: -hh, x2: x, y2: hh, major: i % majorEvery === 0 });
    }
    for (let i = Math.ceil(-hh / step); i * step <= hh + 1e-9; i++) {
      const y = i * step;
      lines.push({ x1: -hw, y1: y, x2: hw, y2: y, major: i % majorEvery === 0 });
    }
    return lines;
  });

  /** Other sketches on the same face, drawn faintly for reference. */
  readonly otherSketches = computed(() => {
    const surface = this.draft().surface;
    return (this.params().sketches ?? [])
      .map((sketch, i) => ({ sketch, i }))
      .filter(({ sketch, i }) => i !== this.index() && sketch.surface === surface)
      .map(({ sketch }) => sketch);
  });

  readonly polygonWarning = computed(() => {
    const d = this.draft();
    if (d.shape !== 'polygon') return '';
    const pts = cleanPolygon(d.points ?? []);
    if (pts.length < 3) return 'A polygon needs at least 3 points.';
    if (isSelfIntersecting(pts)) return 'Edges cross each other: the shape may not build.';
    return '';
  });

  readonly canSave = computed(() => {
    const d = this.draft();
    if (!(d.depth > 0)) return false;
    if (d.shape === 'circle') return d.diameter > 0;
    if (d.shape === 'rectangle') return d.width > 0 && d.height > 0;
    return cleanPolygon(d.points ?? []).length >= 3;
  });

  readonly hint = computed(() => {
    switch (this.tool()) {
      case 'rectangle':
        return 'Drag to draw a rectangle.';
      case 'circle':
        return 'Drag from the centre outwards to draw a circle.';
      case 'polygon':
        return this.polyPoints().length === 0
          ? 'Click to place points. Click the first point (or press Enter) to close the shape.'
          : 'Keep clicking points · click the first point / Enter to finish · Backspace undoes · Esc cancels';
      default:
        return 'Drag to move the shape.';
    }
  });

  ngOnInit(): void {
    const s = this.sketch();
    this.draft.set({ ...s, points: (s.points ?? []).map(([x, y]) => [x, y]) });
    this.tool.set(this.index() >= 0 ? 'move' : s.shape === 'circle' ? 'circle' : 'rectangle');
    this.snapStep.set(this.params().measurementSystem === 'imperial' ? 0.05 : 1);
  }

  ngAfterViewInit(): void {
    const dialog = this.dialogRef?.nativeElement;
    if (dialog && !dialog.open) {
      dialog.showModal();
    }
  }

  // ---- Form handlers ------------------------------------------------------

  patch(patch: Partial<SketchFeature>): void {
    this.draft.update((d) => ({ ...d, ...patch }));
  }

  patchNumber(key: keyof SketchFeature, raw: string): void {
    const value = parseFloat(raw);
    if (!Number.isNaN(value)) {
      this.patch({ [key]: value } as Partial<SketchFeature>);
    }
  }

  setSurface(surface: Surface): void {
    this.patch({ surface });
  }

  setSide(side: SketchSide): void {
    this.patch({ side });
  }

  setOperation(operation: SketchOperation): void {
    this.patch({ operation });
  }

  setShape(shape: SketchShape): void {
    this.patch({ shape });
    this.setTool(shape);
  }

  setTool(tool: SketchTool): void {
    this.tool.set(tool);
    this.polyPoints.set([]);
    this.dragShape.set(null);
  }

  setSnapStep(raw: string): void {
    const value = parseFloat(raw);
    if (value > 0) this.snapStep.set(value);
  }

  updatePoint(i: number, axis: 0 | 1, raw: string): void {
    const value = parseFloat(raw);
    if (Number.isNaN(value)) return;
    this.draft.update((d) => {
      const points = d.points.map((p) => [...p] as Pt);
      points[i][axis] = value;
      return { ...d, points };
    });
  }

  removePoint(i: number): void {
    this.draft.update((d) => ({ ...d, points: d.points.filter((_, j) => j !== i) }));
  }

  addPointAfter(i: number): void {
    this.draft.update((d) => {
      const points = d.points.map((p) => [...p] as Pt);
      const a = points[i];
      const b = points[(i + 1) % points.length] ?? a;
      points.splice(i + 1, 0, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]);
      return { ...d, points };
    });
  }

  centerOnFace(): void {
    this.patch({ x: 0, y: 0 });
  }

  save(): void {
    if (!this.canSave()) return;
    const d = this.draft();
    const result: SketchFeature = {
      ...d,
      points: d.shape === 'polygon' ? cleanPolygon(d.points) : d.points,
    };
    this.closeDialog();
    this.saved.emit(result);
  }

  cancel(): void {
    this.closeDialog();
    this.cancelled.emit();
  }

  onDialogCancel(event: Event): void {
    // Esc: first abort an in-progress polygon, otherwise close.
    event.preventDefault();
    if (this.polyPoints().length > 0) {
      this.polyPoints.set([]);
      return;
    }
    this.cancel();
  }

  onKeydown(event: KeyboardEvent): void {
    const target = event.target as HTMLElement | null;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'SELECT')) return;
    if (this.tool() !== 'polygon') return;
    if (event.key === 'Enter') {
      event.preventDefault();
      this.finishPolygon();
    } else if (event.key === 'Backspace') {
      event.preventDefault();
      this.polyPoints.update((pts) => pts.slice(0, -1));
    }
  }

  // ---- Canvas drawing -----------------------------------------------------

  /** Pointer position in face coordinates (+y up). */
  private toFace(event: PointerEvent | MouseEvent, snap = this.snap()): Pt | null {
    const g = this.canvasRef?.nativeElement;
    const svg = g?.ownerSVGElement;
    const ctm = g?.getScreenCTM();
    if (!g || !svg || !ctm) return null;
    const pt = svg.createSVGPoint();
    pt.x = event.clientX;
    pt.y = event.clientY;
    const local = pt.matrixTransform(ctm.inverse());
    let x = local.x;
    let y = local.y;
    if (snap) {
      const step = this.snapStep();
      x = Math.round(x / step) * step;
      y = Math.round(y / step) * step;
    }
    return [this.round(x), this.round(y)];
  }

  private round(v: number): number {
    return Math.round(v * 10000) / 10000;
  }

  onCanvasPointerDown(event: PointerEvent): void {
    if (event.button !== 0) return;
    const p = this.toFace(event);
    if (!p) return;
    (event.currentTarget as Element).setPointerCapture?.(event.pointerId);

    const tool = this.tool();
    if (tool === 'rectangle' || tool === 'circle') {
      this.dragShape.set({ start: p, end: p });
    } else if (tool === 'move') {
      const d = this.draft();
      this.moveStart = { pointer: p, x: d.x, y: d.y };
    } else if (tool === 'polygon') {
      const pts = this.polyPoints();
      if (pts.length >= 3 && this.isNearFirstPoint(p)) {
        this.finishPolygon();
        return;
      }
      const last = pts[pts.length - 1];
      if (!last || last[0] !== p[0] || last[1] !== p[1]) {
        this.polyPoints.set([...pts, p]);
      }
    }
  }

  onCanvasPointerMove(event: PointerEvent): void {
    const p = this.toFace(event);
    this.cursor.set(p);
    if (!p) return;

    const drag = this.dragShape();
    if (drag) {
      this.dragShape.set({ start: drag.start, end: p });
      return;
    }
    if (this.moveStart) {
      const { pointer, x, y } = this.moveStart;
      this.patch({ x: this.round(x + p[0] - pointer[0]), y: this.round(y + p[1] - pointer[1]) });
    }
  }

  onCanvasPointerUp(): void {
    this.moveStart = null;
    const drag = this.dragShape();
    if (!drag) return;
    this.dragShape.set(null);

    const [sx, sy] = drag.start;
    const [ex, ey] = drag.end;
    if (this.tool() === 'rectangle') {
      const width = this.round(Math.abs(ex - sx));
      const height = this.round(Math.abs(ey - sy));
      if (width <= 0 || height <= 0) return;
      this.patch({
        shape: 'rectangle',
        x: this.round((sx + ex) / 2),
        y: this.round((sy + ey) / 2),
        width,
        height,
        rotation: 0,
      });
    } else if (this.tool() === 'circle') {
      const diameter = this.round(Math.hypot(ex - sx, ey - sy) * 2);
      if (diameter <= 0) return;
      this.patch({ shape: 'circle', x: sx, y: sy, diameter });
    }
    this.tool.set('move');
  }

  onCanvasDoubleClick(): void {
    if (this.tool() === 'polygon') this.finishPolygon();
  }

  onCanvasPointerLeave(): void {
    this.cursor.set(null);
  }

  private isNearFirstPoint(p: Pt): boolean {
    const first = this.polyPoints()[0];
    if (!first) return false;
    const { width, height } = this.face();
    return Math.hypot(p[0] - first[0], p[1] - first[1]) <= Math.max(width, height) * 0.025;
  }

  finishPolygon(): void {
    const pts = cleanPolygon(this.polyPoints());
    this.polyPoints.set([]);
    if (pts.length < 3) return;
    const xs = pts.map((p) => p[0]);
    const ys = pts.map((p) => p[1]);
    const cx = this.round((Math.min(...xs) + Math.max(...xs)) / 2);
    const cy = this.round((Math.min(...ys) + Math.max(...ys)) / 2);
    this.patch({
      shape: 'polygon',
      x: cx,
      y: cy,
      rotation: 0,
      points: pts.map(([x, y]) => [this.round(x - cx), this.round(y - cy)] as Pt),
    });
    this.tool.set('move');
  }

  // ---- SVG helpers --------------------------------------------------------

  shapeTransform(s: SketchFeature): string {
    return `translate(${s.x} ${s.y}) rotate(${s.rotation ?? 0})`;
  }

  pointsAttr(points: ReadonlyArray<readonly [number, number]>): string {
    return points.map(([x, y]) => `${x},${y}`).join(' ');
  }

  rectRadius(s: SketchFeature): number {
    return Math.max(0, Math.min(s.cornerRadius ?? 0, Math.min(s.width, s.height) / 2));
  }

  dragRect = computed(() => {
    const d = this.dragShape();
    if (!d || this.tool() !== 'rectangle') return null;
    return {
      x: Math.min(d.start[0], d.end[0]),
      y: Math.min(d.start[1], d.end[1]),
      w: Math.abs(d.end[0] - d.start[0]),
      h: Math.abs(d.end[1] - d.start[1]),
    };
  });

  dragCircle = computed(() => {
    const d = this.dragShape();
    if (!d || this.tool() !== 'circle') return null;
    return {
      cx: d.start[0],
      cy: d.start[1],
      r: Math.hypot(d.end[0] - d.start[0], d.end[1] - d.start[1]),
    };
  });

  /** Font size for in-canvas labels, in face units. */
  readonly labelSize = computed(() => Math.max(this.face().width, this.face().height) * 0.035);

  private closeDialog(): void {
    const dialog = this.dialogRef?.nativeElement;
    if (dialog?.open) dialog.close();
  }
}
