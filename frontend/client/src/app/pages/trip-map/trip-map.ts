import { Component, OnInit } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import * as L from 'leaflet';

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'assets/leaflet/marker-icon-2x.png',
    iconUrl: 'assets/leaflet/marker-icon.png',
    shadowUrl: 'assets/leaflet/marker-shadow.png',
});

interface Activity {
    name: string;
    coords?: { lat: number; lng: number } | null;
    location?: string;
    start?: string;
}

interface DayPlan {
    date: string;
    activities: Activity[];
}

@Component({
    selector: 'app-trip-map',
    standalone: true,
    templateUrl: './trip-map.html',
    styleUrls: ['./trip-map.css'],
})
export class TripMapComponent implements OnInit {
    tripName: string = '';
    private days: DayPlan[] = [];
    private map!: L.Map;
    private tripId: string = '';

    constructor(private router: Router, private route: ActivatedRoute) {}

    ngOnInit() {
        const state = history.state as any;
        this.tripName = state?.tripName || 'Trip Map';
        this.days = state?.days || [];
        this.route.queryParams.subscribe(queryParams => {
            this.tripId = queryParams['tripId'] || state?.tripId || '';
        })

        this.map = L.map('trip-map').setView([20, 10], 2);
        this.injectPopupStyles();
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: 'OpenStreetMap contributors'
        }).addTo(this.map);
        this.plotDays();
    }

    private formatDayLabel(date: string): string {
        if (date.startsWith('general-')) return `Day ${date.replace('general-', '')}`;
        const d = new Date(date + 'T00:00:00');
        return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    }

    private async plotDays() {
        const pins: { latlng: L.LatLng; label: string; actName: string; dayUrl: string }[] = [];

        for (const day of this.days) {
            const act = day.activities.find(a => a.coords ?.lat && a.coords?.lng);
            if (act?.coords) {
                pins.push({
                    latlng: L.latLng(act.coords.lat, act.coords.lng),
                    label: this.formatDayLabel(day.date),
                    actName: act.name,
                    dayUrl: `/day/${day.date}?tripId=${this.tripId}`
                });
            }
        }

        if (pins.length === 0) {
            alert('No activities with map locations found in this trip.');
            return;
        }
        pins.forEach((pin: { latlng: L.LatLng; label: string; actName: string; dayUrl: string }, i: number) => {
            const icon = L.divIcon({
                className: '',
                html: `<div style="
                    background:#2563eb;color:#fff;border-radius:50%;
                    width:38px;height:38px;display:flex;align-items:center;
                    justify-content:center;font-weight:bold;font-size:18px;
                    border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.4);">
                    ${i + 1}
                </div>`,
                iconSize: [38, 38],
                iconAnchor: [20, 20]
            });

            L.marker(pin.latlng, { icon })
                .addTo(this.map)
                .bindPopup(`
                    <div style="text-align:center; font-size:20px; min-width:140px;">
                        <b style="font-size:24px;">${pin.label}</b><br/>
                        ${pin.actName}<br/>
                        <a href="${pin.dayUrl}" style="color:#2563eb; font-size: 20px;">View Day</a>
                    </div>
                `);
        });

        const group = L.featureGroup(pins.map((p: { latlng: L.LatLng }) => L.marker(p.latlng)));
        this.map.fitBounds(group.getBounds().pad(0.2));

        if (pins.length >= 2) {
            await this.drawRoute(pins.map((p: { latlng: L.LatLng }) => p.latlng));
        }
    }

    private async drawRoute(waypoints: L.LatLng[]) {
        try {
            const coords = waypoints.map(w => `${w.lng},${w.lat}`).join(';');
            const url = `https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson`;
            const res = await fetch(url);
            const data = await res.json();

            if (data.routes?.[0]?.geometry) {
                L.geoJSON(data.routes[0].geometry, {
                    style: { color: '#2563eb', weight: 4, opacity: 0.7 }
                }).addTo(this.map);
            }
        } catch (err) {
            console.error ('Route fetch failed:', err);
            const latlngs = waypoints.map(w => [w.lat, w.lng] as [number, number]);
            L.polyline(latlngs, { color: '#2563eb', weight: 3, dashArray: '8,6' }).addTo(this.map);
        }
    }
    
    goBack() {
        history.back();
    }

    private injectPopupStyles() {
        const style = document.createElement('style');
        style.textContent = `
            .leaflet-popup-close-button {
                font-size: 28px !important;
                width: 34px !important;
                height: 34px !important;
                line-height: 34px !important;
                top: 4px !important;
                right: 4px !important;
                color: #333 !important;
            }
        `;
        document.head.appendChild(style);
    }
}