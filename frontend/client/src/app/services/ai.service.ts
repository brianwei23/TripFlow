import { Injectable } from '@angular/core';
import { environment } from '../../environments/environment';

@Injectable({
    providedIn: 'root'
})
export class AIService {
    async analyzeDay(dayPayload: any) {
        const res = await fetch(`${environment.backendUrl}/api/analyze-day`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(dayPayload)
        });
        if (!res.ok) {
            throw new Error('AI analysis failed');
        }
        return await res.json();
    }

    async autofillDay(payload: any): Promise<any> {
        const res = await fetch(`${environment.backendUrl}/api/autofill-day`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!res.ok) throw new Error('AI autofill failed');

        return await res.json();
    }
}