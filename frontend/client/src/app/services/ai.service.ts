import { Injectable } from '@angular/core';

@Injectable({
    providedIn: 'root'
})
export class AIService {
    async analyzeDay(dayPayload: any) {
        const res = await fetch('http://localhost:5000/api/analyze-day', {
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
        const res = await fetch('http://localhost:5000/api/autofill-day', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!res.ok) throw new Error('AI autofill failed');

        return await res.json();
    }
}