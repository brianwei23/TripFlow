import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
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
  imports: [FormsModule],
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

  searchQuery: string = '';

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

  async searchLocation() {
    if (!this.searchQuery.trim()) return;

    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(this.searchQuery)}`;

    try {
      const response = await fetch(url);
      const data = await response.json();

      if (data && data.length > 0) {
        const bestMatch = data[0];
        const lat = parseFloat(bestMatch.lat);
        const lon = parseFloat(bestMatch.lon);
        const latlng = L.latLng(lat, lon);

        // Go to searched location
        this.map.setView(latlng, 15);

        if (this.marker) {
          this.marker.setLatLng(latlng);
        } else {
          this.marker = L.marker(latlng).addTo(this.map);
        }
        this.selectedLatLng = latlng;
        this.selectedLocationName = bestMatch.display_name || bestMatch.name || this.searchQuery;
      } else {
        alert('Location not found.');
      }
    } catch (error) {
      console.error('Search error:', error);
      alert('Something is wrong with your search. Please try again.');
    }
  }


  confirmLocation() {
    const lat = this.selectedLatLng?.lat;
    const lng = this.selectedLatLng?.lng;
    this.router.navigate(['/day', this.returnDate], {
      queryParams: { tripId: this.savedState?.tripId },
      state: {
        tripId: this.savedState?.tripId,
        tripName: this.savedState?.tripName,

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
      queryParams: { tripId: this.savedState?.tripId },
      state: this.savedState
    });
  }
}