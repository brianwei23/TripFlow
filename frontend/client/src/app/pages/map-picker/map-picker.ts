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
  id?: string;
  start?: string;
  end?: string;
  expectedCost?: number;
  location?: string;
  coords?: {
    lat: number;
    lng: number;
  } | null;
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

  private savedState: any;
  selectedLocationName: string = '';
  selectedLatLng!: L.LatLng;

  constructor(private router: Router) {}

  ngOnInit() {
    this.savedState = history.state;
    this.returnDate = this.savedState.date!;
    // Create map
    this.map = L.map('map').setView([20, 10], 2);


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
    const lat = this.selectedLatLng?.lat;
    const lng = this.selectedLatLng?.lng;
    this.router.navigate(['/day', this.returnDate], {
      state: {
        pickedLocation: this.selectedLocationName,
        pickedCoords: lat !== undefined ? {lat, lng} : null,

        editingActivity: this.savedState?.editingActivity ?? null,
        isNewActivity: this.savedState?.isNewActivity ?? false,
        slotHourLabel: this.savedState?.slotHourLabel ?? null,
        tempActivity: this.savedState?.tempActivity ?? null
      }
    });
  }

  cancel() {
    this.router.navigate(['/day', this.returnDate], {
      state: this.savedState
    });
  }
}