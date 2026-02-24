import { Component, inject, ChangeDetectorRef } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../services/auth.service';
import { Router, ActivatedRoute, RouterModule } from '@angular/router';
import { AIService } from '../../services/ai.service';
import { CommonModule } from '@angular/common';
import { Firestore } from '@angular/fire/firestore';
import { collection, doc, getDoc, getDocs, setDoc, deleteDoc } from 'firebase/firestore';
import { WeatherComponent } from '../weather/weather';
import { environment } from '../../../environments/environment';

interface Activity {
  name: string;
  id?: string; // For activities with duplicate names
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
  source?: 'user' | 'ai';
  temp?: Activity;
}

interface DayPlan {
  date: string;
  activities: Activity[];
  tempActivity?: Activity;
  isEditingNew?: boolean;
  aiAnalysisResult?: string;
  aiHasAnalyzed?: boolean;
}

interface PersistedDayPlan {
  date: string;
  activities: Activity[];
}

@Component({
  selector: 'app-home',
  imports: [FormsModule, CommonModule, RouterModule, WeatherComponent],
  standalone: true,
  templateUrl: './home.html',
  styleUrls: ['./home.css'],
})
export class HomeComponent {
  days: DayPlan[] = [];
  private cdr = inject(ChangeDetectorRef);

  private auth = inject(AuthService);
  private router = inject(Router);

  private firestore = inject(Firestore);

  // Date tiles sort
  sortRecentFirst: boolean = false;

  currentDayIndex: number = -1;

  selectedDate: string = '';
  firstDayAdded: boolean = false;

  private route = inject(ActivatedRoute);

  private aiService = inject(AIService);

  isHomePage: boolean = false;

  showWeatherPopup = false;
  weatherData: any = null;
  weatherDate: string = '';
  weatherLocation: string = '';

  // AI Analysis variables
  showAIAnalysisPopup = false;
  isAnalyzing = false;
  aiAnalysisResult = '';

  isAutofilling = false;

  ngOnInit() {
    this.route.params.subscribe(async params => {
      const dateParam = params['date'];
     
      if (dateParam) {
        this.isHomePage = false;

        this.selectedDate = dateParam;

        let navState = history.state as any;

        if (navState && navState.preloadedDay && navState.preloadedDay.date === dateParam) {
          this.days = [navState.preloadedDay];
          this.currentDayIndex = 0;
          this.firstDayAdded = true;
        } else {
          const dayFromDb = await this.loadDayFromFirebase(dateParam);
          if (dayFromDb) {
            this.days = [dayFromDb];
            this.currentDayIndex = 0;
            this.firstDayAdded = true;
          } else {
            this.days = [];
            this.firstDayAdded = false;
        }
      }

        if (navState?.editingActivity) {
          const editingAct = this.days
            .flatMap(d => d.activities)
            .find(a => a.id === navState.editingActivity?.id);
          if (editingAct) {
            editingAct.isEditing = true;

            editingAct.temp = {
              ...editingAct.temp,
              ...navState.editingActivity
            };

            // Apply picked location
            if (navState.pickedLocation) editingAct.temp!.location = navState.pickedLocation;

            if (navState.pickedCoords) editingAct.temp!.coords = navState.pickedCoords;
          }
        }
        if (navState?.isNewActivity && this.days.length) {
          const day = this.days[0];
          day.isEditingNew = true;

          if (!day.tempActivity) {
            day.tempActivity = { name: '', start: '', end: '', expectedCost: undefined, actualCost: null };
          }

          if (navState.tempActivity) day.tempActivity = { ...day.tempActivity, ...navState.tempActivity };
          if (navState.pickedLocation) day.tempActivity!.location = navState.pickedLocation;
          if (navState.pickedCoords) day.tempActivity!.coords = navState.pickedCoords;
        }
        const currentNav = this.router.currentNavigation();
        if (currentNav && currentNav.extras) {
          currentNav.extras.state = undefined;
        }
        window.history.replaceState({}, '');
      } else {
        this.isHomePage = true;
        this.days = [];
        await this.loadAllDays();
      }  
      this.cdr.detectChanges(); // Force UI refresh after any route change/data load
      });
  }


  async saveDayToFirebase(day: DayPlan) {
    const uid = this.auth.uid;
    if (!uid) return;

    const sanitizedDay: PersistedDayPlan = {
      date: day.date,
      activities: day.activities.map(act => ({
        name: act.name,
        id: act.id,
        start: act.start,
        end: act.end,
        expectedCost: act.expectedCost,
        location: act.location || '',
        coords: act.coords || null,
        actualCost: act.actualCost !== undefined ? act.actualCost : null
      }))
    };
    const docRef = doc(this.firestore, 'users', uid, 'days', day.date);
    await setDoc(docRef, sanitizedDay);
  }


  async loadDayFromFirebase(date: string): Promise<DayPlan | null> {
    const uid = this.auth.uid;
    const docRef = doc(this.firestore, 'users', uid, 'days', date);
    const docSnap = await getDoc(docRef);


    if (!docSnap.exists()) return null;


    const data = docSnap.data() as PersistedDayPlan;
    return {
      date: data.date,
      activities: data.activities ?? [],
      tempActivity: {name: '', start: '', end: '', expectedCost: undefined, actualCost: null},
      isEditingNew: false,
    };
  }


  showCurrentDay() {
    return this.currentDayIndex >= 0 && this.currentDayIndex < this.days.length
      ? [this.days[this.currentDayIndex]]
      : [];
  }


  toggleSortRecent() {
    if (this.sortRecentFirst) {
      this.days.sort((a, b) => b.date.localeCompare(a.date)); //Most recent first
    } else {
      this.days.sort((a, b) => a.date.localeCompare(b.date)); //Oldest first
    }
  }


  navigateExistingDay(direction: 'next' | 'prev') {
    if (direction === 'next' && this.currentDayIndex < this.days.length - 1) {
      this.currentDayIndex++;
    } else if (direction === 'prev' && this.currentDayIndex > 0) {
      this.currentDayIndex--;
    }
  }


  editActivity(act: Activity) {
    act.isEditing = true;
    act.temp = {
      name: act.name,
      start: act.start,
      end: act.end,
      expectedCost: act.expectedCost,
      location: act.location,
      coords: act.coords ?? null,
      actualCost: act.actualCost
    };
    this.cdr.detectChanges();
  }


  cancelEditActivity(act: Activity) {
    act.isEditing = false;
    this.cdr.detectChanges();
  }


  saveEditedActivity(day: DayPlan, act: Activity) {
    const temp = act.temp;
    if (!temp) return;
    if (!temp.name || !temp.start || !temp.end || temp.expectedCost == undefined || temp.expectedCost == null) {
      alert('Activity name, times, and expected cost must be filled.');
      return;
    }
    if (temp.expectedCost < 0 || (temp.actualCost != null && temp.actualCost < 0)) {
      alert('Cost cannot be less than 0.')
      return;
    }
    if (temp.start >= temp.end) {
      alert('Start time must be before end time');
      return;
    }  

    act.name = temp.name;
    act.start = temp.start;
    act.end = temp.end;
    act.expectedCost = temp.expectedCost;
    act.location = temp.location;
    act.coords = temp.coords ?? null;
    act.actualCost = temp.actualCost;

    day.activities.sort((a, b) => (a.start || "").localeCompare(b.start || ""));

    this.invalidateAIAnalysis(day); 

    act.isEditing = false;
    act.temp = undefined;

    this.saveDayToFirebase(day);
    this.cdr.detectChanges();
  }

  async addDay() {
    // Display time picker after date is selected
    if (!this.selectedDate) {
      alert('Please select a date first.');
      return;
    }

    const existing = this.days.find(d => d.date === this.selectedDate);
    if (existing) {
      this.router.navigate(['/day', this.selectedDate]);
      return;
    }

    const newDay: DayPlan = {
      date: this.selectedDate,
      activities: [],
      tempActivity: { name: '', start: '', end: '', expectedCost: undefined, actualCost: null },
      isEditingNew: false,
    };

    await this.saveDayToFirebase(newDay);
    this.router.navigate(['/day', this.selectedDate]);
  }


  saveActivity(day: DayPlan) {
    const act = day.tempActivity;

    if (!act || !act.name) return;


    if (!act.start || !act.end) {
      alert('Please enter both start and end times.');
      return;
    }


    if (act.start >= act.end) {
      alert('Activity start time must be before end time.');
      return;
    }


    if (act.expectedCost === undefined || act.expectedCost === null || act.expectedCost < 0 || (act.actualCost != null && act.actualCost < 0)) {
      alert('Please enter a valid expected cost.');
      return;
    }

    const finalActivity: Activity = {
      ...act,
      id: act.id || Date.now().toString() + Math.random().toString(36).slice(2, 11)
    };

    day.activities.push(finalActivity);

    // Sort by earliest start time
    day.activities.sort((a, b) => (a.start || "").localeCompare(b.start || ""));
    this.invalidateAIAnalysis(day);

    // Resetting form
    day.tempActivity = {name: '', start: '', end: '', expectedCost: undefined, actualCost: null};
    day.isEditingNew = false;
    

    this.saveDayToFirebase(day);
    // Force Angular to see changes
    this.cdr.detectChanges();
  }


  navigateToDay(direction: 'next' | 'prev') {
    const current = new Date(this.selectedDate);
    if (direction === 'next') current.setDate(current.getDate() + 1);
    else current.setDate(current.getDate() - 1);


    const newDate = current.toISOString().split('T')[0];
    this.router.navigate(['/day', newDate]);
  }


  async loadAllDays() {
   const uid = this.auth.uid;
   const daysCol = collection(this.firestore, 'users', uid, 'days');
   const snapshot = await getDocs(daysCol);


   this.days = snapshot.docs
    .map(doc => {
      const data = doc.data() as PersistedDayPlan;
      return {
        date: data.date,
        activities: data.activities ?? [],
        isEditing: false,
        tempActivity: { name: '', start: '', end: '', expectedCost: undefined, actualCost: null }
      } as DayPlan;
    })
    .sort((a, b) => a.date.localeCompare(b.date));

   this.firstDayAdded = this.days.length > 0;

   console.log('Days loaded for homepage:', this.days.length);
   this.cdr.detectChanges();
  }


  goToDay(date: string) {
    const day = this.days.find(d => d.date === date);
    this.router.navigate(['/day', date], {
      state: {preloadedDay: day}
    });
  }


  openMapForActivity(act: Activity) {
    if (!act.temp) act.temp = {...act};
    this.router.navigate(['/map-picker'], {
      state: { date: this.selectedDate, editingActivity: {...act.temp, id: act.id}}
    });
  }

  openMapForNewActivity(day: DayPlan) {
    this.router.navigate(['/map-picker'], {
      state: {
        date: this.selectedDate,
        isNewActivity: true,
        tempActivity: day.tempActivity
      }
    });
  }

  toggleAddForm(day: DayPlan) {
    day.isEditingNew = true;
    if (!day.tempActivity) {
      day.tempActivity = {name: '', start: '', end: '', expectedCost: undefined, actualCost: null};
    }
    this.cdr.detectChanges();
  }

  cancelAddActivity(day: DayPlan) {
    day.isEditingNew = false;
    this.cdr.detectChanges();
  }


  logout() {
    this.auth.logout().then(() => {
      this.router.navigate(['/login']);
    }).catch(err => alert(err.message));
  }


  deleteActivity(day: DayPlan, act: Activity) {
    const confirmDelete = confirm(`Delete activity "${act.name}"?`);
    if (!confirmDelete) return;

    day.activities = day.activities.filter(a => a !== act);
    this.invalidateAIAnalysis(day);
    window.history.replaceState({}, '');
    this.saveDayToFirebase(day);
    this.cdr.detectChanges();
  }

  async deleteDay(day: DayPlan) {
    const confirmDelete = confirm(
      `Delete the entire day (${day.date})? This cannot be undone.`
    );

    if (!confirmDelete) return;

    const uid = this.auth.uid;
    const docRef = doc(this.firestore, 'users', uid, 'days', day.date);
    await deleteDoc(docRef);

    this.days = this.days.filter(d => d.date !== day.date);
    this.router.navigate(['/home']);
  }

  async openWeather(day: DayPlan, coords: {lat: number; lng: number} | null | undefined) {
    if (!coords) {
      alert('You must select a location from the map');
      return;
    }
    this.showWeatherPopup = true;
    this.weatherDate = day.date;
    this.weatherData = null;

    try {
      const res = await fetch(
        `${environment.backendUrl}/api/weather?lat=${coords.lat}&lng=${coords.lng}&date=${day.date}`
      );

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || `HTTP error status: ${res.status}`);
      }

      const data=  await res.json();
      console.log('Weather API response:', data);

      if (!data.forecast || !data.forecast[0]) {
        console.error('Missing forecast data:', data);
        throw new Error('Invalid weather data received, no forecast data.');
      }

      const forecastDay = data.forecast[0].day;
      forecastDay.date = data.forecast[0].date;

      if (!forecastDay) {
        console.error('Missing day data:', data.forecast[0]);
        throw new Error('Invalid weather data received, there is no day data');
      }
      console.log('Forecast day data:', forecastDay);
      this.weatherData = forecastDay;
      this.weatherLocation = data.location || '';
      this.cdr.detectChanges();
    } catch (error) {
      console.error('Weather fetch error:', error);
      alert(`Failed to load weather: ${error}. Forecast possibly unavailable. You may have to use a day closer to the current day.`);
      this.showWeatherPopup = false;
    }
  }

  closeWeatherPopup() {
    this.showWeatherPopup = false;
    this.cdr.detectChanges();
  }

  private getAllActivities(day: DayPlan): Activity[] {
    return day.activities || [];
  }

  getExpectedTotalCost(day: DayPlan): number {
    return this.getAllActivities(day).reduce((sum, act) => sum + (act.expectedCost ?? 0), 0);
  }

  getActualTotalCost(day: DayPlan): number {
    return this.getAllActivities(day).reduce((sum, act) => sum + (act.actualCost ?? 0), 0);
  }

  getBudgetDifferencePercent(day: DayPlan): number {
    const expected = this.getExpectedTotalCost(day);
    const actual = this.getActualTotalCost(day);

    if (expected === 0) return 0;
    return ((actual - expected) / expected) * 100;
  }

  getPlanningAccuracyScore(day: DayPlan): number {
    const expected = this.getExpectedTotalCost(day);
    const actual = this.getActualTotalCost(day);

    if (expected === 0) return 1;

    const deviation = Math.abs(actual - expected);
    const accuracy = 1 - deviation / expected;
    return Math.max(0, Math.min(1, accuracy));
  }

  getTotalScheduledHours(day: DayPlan): number {
    const activities = this.getAllActivities(day);
    if (!activities || activities.length === 0) return 0;

    let totalMinutes = 0;
    for (const act of activities) {
      if (act.start && act.end) {
        const start = this.parseTimeToMinutes(act.start);
        const end = this.parseTimeToMinutes(act.end);
        if (end > start) {
          totalMinutes += (end - start);
        }
      }
    }
    return totalMinutes / 60;
  }

  getActualCostDensity(day: DayPlan): number {
    const actual = this.getActualTotalCost(day);
    const hours = this.getTotalScheduledHours(day);

    if (hours === 0) return 0;

    return actual / hours;
  }

  getExpectedCostDensity(day: DayPlan): number {
    const expected = this.getExpectedTotalCost(day);
    const hours = this.getTotalScheduledHours(day);
    if (hours === 0) return 0;
    return expected / hours;
  }

  private parseTimeToMinutes(time: string): number {
    const [h, m] = time.split(':').map(Number);
    return h * 60 + m;
  }

  formatTime(time: string | undefined): string {
    if (!time) return '';
    const [h, m] = time.split(':').map(Number);
    const period = h >= 12 ? 'PM' : 'AM';
    const hour = h % 12 || 12;
    return `${hour}:${m.toString().padStart(2, '0')} ${period}`;
  }

  async analyzeCurrentDay(day: DayPlan) {
    if (day.aiHasAnalyzed && day.aiAnalysisResult) {
      this.aiAnalysisResult = day.aiAnalysisResult;
      this.showAIAnalysisPopup = false;
      this.cdr.detectChanges();
      this.showAIAnalysisPopup = true;
      this.cdr.detectChanges();
      return;
    }

    this.showAIAnalysisPopup = true;
    this.isAnalyzing = true;

    this.aiAnalysisResult = '';
    this.cdr.detectChanges();

    const payload = {
      date: day.date,
      activities: this.getAllActivities(day),
      metrics: {
        expectedTotal: this.getExpectedTotalCost(day),
        actualTotal: this.getActualTotalCost(day),
        planningAccuracy: this.getPlanningAccuracyScore(day),
        expectedCostDensity: this.getExpectedCostDensity(day),
        actualCostDensity: this.getActualCostDensity(day)
      }
    };

    try {
      const result = await this.aiService.analyzeDay(payload);
      this.aiAnalysisResult = result.analysis;
      day.aiAnalysisResult = result.analysis;
      day.aiHasAnalyzed = true;
    } catch (err) {
      console.error(err);
      this.aiAnalysisResult = "Failed to connect to the AI.";
    } finally {
      this.isAnalyzing = false;
      this.cdr.detectChanges();
    }
  }
  
  closeAIPopup() {
    this.showAIAnalysisPopup = false;
    this.cdr.detectChanges();
  }

  formatAIResponse(text: string): string {
    if (!text) return '';
    let formatted = text;
    // Ensure bold font if it's in response
    formatted = formatted.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    formatted = formatted.replace(/\n/g, '<br>');
    return formatted;
  }

  getEmptyTimeSlots(day: DayPlan) {
    const activities = this.getAllActivities(day)
      .filter(a => a.start && a.end)
      .sort((a, b) => a.start!.localeCompare(b.start!));

    const gaps: { start: string; end: string } [] = [];

    let current = "00:00";
    const endOfDay = "23:59";

    for (const act of activities) {
      
      if (act.start! < current && act.end! > current) {
        current = act.end!;
        continue;
      }

      if (act.start! > current) {
        gaps.push({ start: current, end: act.start! });
      }

      if (act.end! > current) {
        current = act.end!;
      }
    }

    if (current < endOfDay) {
      gaps.push({ start: current, end: endOfDay });
    }
    return gaps;
  }

  async autofillCurrentDay(day: DayPlan) {
    const emptySlots = this.getEmptyTimeSlots(day);
    if (emptySlots.length === 0) {
      alert("No empty time slots available.");
      return;
    }

    this.isAutofilling = true;
    this.cdr.detectChanges();

    const payload = {
      existingActivities: this.getAllActivities(day),
      emptySlots,
      dayStart: "00:00",
      dayEnd: "23:59"
    };

    try {
      const response = await this.aiService.autofillDay(payload);
      let cleanJson = response.result;
      if (typeof cleanJson === 'string') {
        cleanJson = cleanJson.replace(/```json/g, '').replace(/```/g, '').trim();
      }
      const parsed = JSON.parse(cleanJson);

      if (!parsed.activities || !Array.isArray(parsed.activities)) {
        throw new Error("Invalid AI format");
      }

      const newActivities = parsed.activities.slice(0, 4);
      let addedCount = 0;
      for (const act of newActivities) {
        if (act.name && act.start && act.end) {
          this.insertAIActivity(day, act);
          addedCount++;
        }
      }
      if (addedCount > 0) {
        this.invalidateAIAnalysis(day);
        await this.saveDayToFirebase(day);
      } else {
        alert("AI did not return any valid activities to add.");
      }
    } catch (err) {
      console.error("Autofill error:", err);
      alert("Autofill failed.");
    } finally {
      this.isAutofilling = false;
      this.cdr.detectChanges();
    }
  }

  insertAIActivity(day: DayPlan, aiActivity: any) {
    const allExisting = this.getAllActivities(day);
    const isDuplicate = allExisting.some(existing => 
      existing.name.toLowerCase() === aiActivity.name.toLowerCase() ||
      existing.start === aiActivity.start
    );
    if (isDuplicate) {
      console.log(`Skipping duplicate AI activity: ${aiActivity.name}`);
      return;
    }
    this.pushAndSortActivity(day, aiActivity);
  }

  private invalidateAIAnalysis(day: DayPlan) {
    day.aiHasAnalyzed = false;
    day.aiAnalysisResult = '';
  }

  private pushAndSortActivity(day: DayPlan, aiActivity: any) {
    const newId = Date.now().toString() + Math.random().toString(36).slice(2, 11);

    day.activities.push({
      id: newId,
      name: aiActivity.name,
      location: aiActivity.location || '',
      start: aiActivity.start,
      end: aiActivity.end,
      expectedCost: aiActivity.expectedCost || 0,
      actualCost: null,
      isEditing: false,
      source: 'ai'
    });
    day.activities.sort((a, b) => (a.start || "").localeCompare(b.start || ""));
    this.cdr.detectChanges();
  }

  private parseLabelToMinutes(label: string): number {
    let [time, modifier] = label.split(' ');
    let [hours, minutes] = time.split(':').map(Number);

    if (modifier === 'PM' && hours < 12) hours += 12;
    if (modifier === 'AM' && hours === 12) hours = 0;
    return hours * 60 + minutes;
  }
}