import { Component, Input, Output, EventEmitter, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-weather',
  imports: [CommonModule],
  standalone: true,
  templateUrl: './weather.html',
  styleUrl: './weather.css',
})
export class WeatherComponent {
  @Input() weatherData: any;
  @Input() date!: string;
  @Input() location?: string;

  @Output() close = new EventEmitter<void>();

  closePopup() {
    this.close.emit();
  }
}
