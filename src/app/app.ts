import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ProjectStoreService } from './core/state/project-store.service';
import { RendererComponent } from './features/renderer/renderer.component';
import { SidebarComponent } from './features/sidebar/sidebar.component';

@Component({
  selector: 'app-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RendererComponent, SidebarComponent],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  // Created at startup so the last project is restored before anything renders.
  private readonly projects = inject(ProjectStoreService);
}
