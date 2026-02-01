import { Component, OnInit } from '@angular/core';
import * as L from 'leaflet';
import { Router } from '@angular/router';

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'assets/leaflet/marker-icon-2x.png',
  iconUrl: 'assets/leaflet/marker-icon.png',
  shadowUrl: 'assets/leaflet/marker-shadow.png',
});

interface Activity {
  name: string;
  start?: string;
  end?: string;
  expectedCost?: number;
  location?: string;
  actualCost?: number | null;
  isEditing?: boolean;
  temp?: Activity;
}

@Component({
  selector: 'app-map-picker',
  imports: [],
  standalone: true,
  templateUrl: './map-picker.html',
  styleUrl: './map-picker.css',
})
export class MapPicker implements OnInit {
  private map!: L.Map;
  private marker!: L.Marker;
  private returnDate!: string;

  selectedLocationName: string = '';
  selectedLatLng!: L.LatLng;

  constructor(private router: Router) {}

  ngOnInit() {
    const navState = history.state as { date?: string; };
    this.returnDate = navState.date!;
    // Create map
    this.map = L.map('map').setView([40.7128, -74.0060], 13);

    // Load tiles
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors'
    }).addTo(this.map);

    // Handling map clicks
    this.map.on('click', async (e: L.LeafletMouseEvent) => {
      this.selectedLatLng = e.latlng;
      if (this.marker) {
        this.marker.setLatLng(e.latlng);
      } else {
        this.marker = L.marker(e.latlng).addTo(this.map);
      }
      // Reverse geocoding
      await this.reverseGeocode(e.latlng.lat, e.latlng.lng);
    });
  }

  async reverseGeocode(lat: number, lon: number) {
    const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}`;
    const response = await fetch(url);
    const data = await response.json();

    this.selectedLocationName = 
      data.name ||
      data.display_name ||
      'Unknown location';
  }

  confirmLocation() {
    const navState = history.state as { editingActivity?: Activity; date?: string}
    if (navState.editingActivity) {
      // update location in editing temp activity
      navState.editingActivity.location = this.selectedLocationName;
    }

    this.router.navigate(['/day', this.returnDate], {
      state: {
        pickedLocation: this.selectedLocationName,
        editingActivity: navState.editingActivity
      }
    });
  }
  cancel() {
    this.router.navigate(['/day', this.returnDate]);
  }

}
