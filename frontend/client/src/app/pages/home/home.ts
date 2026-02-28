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

interface Trip {
  id: string;
  name: string;
  dateRange?: { start: string; end: string } | null;
}

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

  sortTripsOldestFirst: boolean = false;

  currentDayIndex: number = -1;

  selectedDate: string = '';
  firstDayAdded: boolean = false;

  startDateRange: string = '';
  endDateRange: string = '';

  private route = inject(ActivatedRoute);

  private aiService = inject(AIService);

  viewMode: 'trips' | 'days' | 'day-detail' = 'trips';

  trips: Trip[] = [];
  selectedTrip: Trip | null = null;
  showCreateTripForm = false;
  newTripName = '';

  showWeatherPopup = false;
  weatherData: any = null;
  weatherDate: string = '';
  weatherLocation: string = '';

  // AI Analysis variables
  showAIAnalysisPopup = false;
  isAnalyzing = false;
  aiAnalysisResult = '';

  isAutofilling = false;
  autofillLocation: string = '';
  aiTripLocation: string = '';
  isCreatingAITrip: boolean = false;

  isEditingTripName = false;
  editTripNameValue = '';

  isEditingDayDate = false;
  editDayDateValue = '';

  ngOnInit() {
    this.route.params.subscribe(async params => {
      this.cdr.reattach();
      const dateParam = params['date'];
      
      this.route.queryParams.subscribe(async queryParams => {
        const tripIdParam = queryParams['tripId'];
      
        if (dateParam) {
          this.viewMode = 'day-detail';

          this.selectedDate = dateParam;

          if (tripIdParam) {
            const uid = this.auth.uid;
            if (uid) {
              const tripDoc = await getDoc(doc(this.firestore, 'users', uid, 'trips', tripIdParam));
              if (tripDoc.exists()) {
                this.selectedTrip = { id: tripIdParam, name: (tripDoc.data() as any).name || '' };
              } else {
                this.selectedTrip = { id: tripIdParam, name: '' };
              }
            }
          } else if (history.state?.tripId) {
            const uid = this.auth.uid;
            if (uid) {
              const tripDoc = await getDoc(doc(this.firestore, 'users', uid, 'trips', history.state.tripId));
              if (tripDoc.exists()) {
                this.selectedTrip = { id: history.state.tripId, name: (tripDoc.data() as any).name || ''};
              } else {
                this.selectedTrip = { id: history.state.tripId, name: history.state.tripName || ''};
              }
            }
          }

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
        if (tripIdParam) {
          const uid = this.auth.uid;
          if (uid && !this.selectedTrip) {
            const tripDoc = await getDoc(doc(this.firestore, 'users', uid, 'trips', tripIdParam));
            if (tripDoc.exists()) {
              this.selectedTrip = { id: tripIdParam, name: (tripDoc.data() as any).name || ''};
            }
          }
          this.viewMode = 'days';
          await this.loadAllDays();
        } else {
          this.viewMode = 'trips';
          this.days = [];
          await this.loadTrips();
        }
      }  
      this.cdr.detectChanges(); // Force UI refresh after any route change/data load
      });
    });  
  }

  async loadTrips() {
    const uid = this.auth.uid;
    if (!uid) return;
    const tripsCol = collection(this.firestore, 'users', uid, 'trips');
    const snapshot = await getDocs(tripsCol);
    const trips: Trip[] = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Trip));

    await Promise.all(trips.map(async (trip) => {
      const daysCol = collection(this.firestore, 'users', uid, 'trips', trip.id, 'days');
      const daysSnap = await getDocs(daysCol);
      const dates = daysSnap.docs.map(d => d.id).sort();
      trip.dateRange = dates.length > 0 ? {start: dates[0], end: dates[dates.length - 1]} : null;
    }));
    this.trips = trips;
    this.applyTripsSort();
    this.cdr.detectChanges();
  }

  applyTripsSort() {
    this.trips.sort((a, b) => {
      const aStart = a.dateRange?.start ?? '';
      const bStart = b.dateRange?.start ?? '';
      if (!aStart && !bStart) return 0;
      if (!aStart) return 1;
      if (!bStart) return -1;
      const cmp = bStart.localeCompare(aStart); // latest first (default)
      return this.sortTripsOldestFirst ? -cmp : cmp;
    });
  }

  toggleSortTrips() {
    this.applyTripsSort();
    this.cdr.detectChanges();
  }

  async createTrip() {
    if (!this.newTripName.trim()) return;
    const duplicate = this.trips.some(t => t.name.toLowerCase() === this.newTripName.trim().toLowerCase());
    if (duplicate) {
      alert('A trip with this name already exists.');
      return;
    }
    const uid = this.auth.uid;
    if (!uid) {
      alert('You need to be logged in to create a trip.');
      return;
    }
    try {
      const tripId = Date.now().toString();
      const newTrip: Trip = { id: tripId, name: this.newTripName.trim(), dateRange: null };

      await setDoc(doc(this.firestore, 'users', uid, 'trips', tripId), { name: newTrip.name });
      this.trips.push(newTrip);
      this.applyTripsSort();
      this.newTripName = '';
      this.showCreateTripForm = false;
      this.cdr.detectChanges();
  } catch (err) {
    console.error('Failed to create trip:', err);
    alert('Failed the create trip. Please try again.');
  }
}

  async openTrip(trip: Trip) {
    this.selectedTrip = trip;
    this.viewMode = 'days';
    await this.loadAllDays();
    window.history.replaceState({}, '', '/home?tripId=' + trip.id);
    this.cdr.detectChanges();
  }

  openCreateTripForm() {
    this.showCreateTripForm = true;
    this.cdr.detectChanges();
  }

  closeCreateTripForm() {
    this.showCreateTripForm = false;
    this.newTripName = '';
    this.cdr.detectChanges();
  }

  async backToTrips() {
    this.cdr.reattach();
    this.showCreateTripForm = false;
    this.newTripName = '';
    this.viewMode = 'trips';
    this.selectedTrip = null;
    this.days = [];
    this.currentDayIndex = -1;
    await this.loadTrips();
    window.history.replaceState({}, '', '/home');
    this.cdr.detectChanges();
  }

  async backToDays() {
    this.selectedDate = '';
    this.currentDayIndex = -1;
    this.viewMode = 'days';
    if (this.selectedTrip) {
      await this.loadAllDays();
      window.history.replaceState({}, '', '/home?tripId=' + this.selectedTrip.id);
    } 
    this.cdr.detectChanges();
  }


  async saveDayToFirebase(day: DayPlan) {
    const uid = this.auth.uid;
    if (!uid || !this.selectedTrip) return;

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
    const docRef = doc(this.firestore, 'users', uid, 'trips', this.selectedTrip.id, 'days', day.date);
    await setDoc(docRef, sanitizedDay);
  }


  async loadDayFromFirebase(date: string): Promise<DayPlan | null> {
    const uid = this.auth.uid;
    if (!uid || !this.selectedTrip) return null;
    const docRef = doc(this.firestore, 'users', uid, 'trips', this.selectedTrip.id, 'days', date);
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

    this.currentDayIndex = -1;

    const existing = this.days.find(d => d.date === this.selectedDate);
    if (existing) {
      alert(`${this.selectedDate} already exists.`)
      return;
    }

    const newDay: DayPlan = {
      date: this.selectedDate,
      activities: [],
      tempActivity: { name: '', start: '', end: '', expectedCost: undefined, actualCost: null },
      isEditingNew: false,
    };

    await this.saveDayToFirebase(newDay);
    this.router.navigate(['/day', this.selectedDate], {queryParams: {tripId: this.selectedTrip!.id}, state: { tripName: this.selectedTrip!.name}});
  }

  async createDateRange() {
    if (!this.startDateRange || !this.endDateRange) {
      alert('Please select both start and end date.');
      return;
    }
    const start = new Date(this.startDateRange + 'T00:00:00');
    const end = new Date(this.endDateRange + 'T00:00:00');

    if (start > end) {
      alert('Start date cannot be after end date.');
      return;
    }

    let currentDate = new Date(start);
    const savePromises: Promise<void>[] = [];
    let newDaysAdded = 0;

    while (currentDate <= end) {
      const yyyy = currentDate.getFullYear();
      const mm = String(currentDate.getMonth() + 1).padStart(2, '0');
      const dd = String(currentDate.getDate()).padStart(2, '0');
      const dateString = `${yyyy}-${mm}-${dd}`;

      const existing = this.days.find(d => d.date === dateString);
      if (!existing) {
        const newDay: DayPlan = {
          date: dateString,
          activities: [],
          tempActivity: { name: '', start: '', end: '', expectedCost: undefined, actualCost: null },
          isEditingNew: false,
        };
        savePromises.push(this.saveDayToFirebase(newDay));
        newDaysAdded++;
      }
      currentDate.setDate(currentDate.getDate() + 1);
    }
    if (newDaysAdded > 0) {
      await Promise.all(savePromises);
      await this.loadAllDays();
    } else {
      alert('All dates in the range already exist.');
    }
    this.startDateRange = '';
    this.endDateRange = '';
    this.cdr.detectChanges();
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
      alert('Please enter a valid cost.');
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


  async loadAllDays() {
   if (!this.selectedTrip) return;
   const uid = this.auth.uid;
   const daysCol = collection(this.firestore, 'users', uid, 'trips', this.selectedTrip.id, 'days');
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
   this.cdr.detectChanges();
  }


  async goToDay(date: string) {
    this.selectedDate = date;
    
    const index = this.days.findIndex(d => d.date === date);
    if (index !== -1) {
      this.currentDayIndex = index;
    } else {
      const dayFromDb = await this.loadDayFromFirebase(date);
      if (dayFromDb) {
        this.days.push(dayFromDb);
        this.currentDayIndex = this.days.length - 1;
      } else {
        this.currentDayIndex = -1;
      }
    }
    this.viewMode = 'day-detail';
    window.history.replaceState({}, '', `/day/${date}?tripId=${this.selectedTrip?.id}`);
    this.cdr.detectChanges();
  }


  openMapForActivity(act: Activity) {
    if (!act.temp) act.temp = {...act};
    this.router.navigate(['/map-picker'], {
      state: { 
        date: this.selectedDate, 
        tripId: this.selectedTrip?.id,
        tripName: this.selectedTrip?.name,
        editingActivity: {...act.temp, id: act.id}}
    });
  }

  openMapForNewActivity(day: DayPlan) {
    this.router.navigate(['/map-picker'], {
      state: {
        date: this.selectedDate,
        tripId: this.selectedTrip?.id,
        tripName: this.selectedTrip?.name,
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

    if (!confirmDelete || !this.selectedTrip) return;

    const uid = this.auth.uid;
    const docRef = doc(this.firestore, 'users', uid, 'trips', this.selectedTrip.id, 'days', day.date);
    await deleteDoc(docRef);

    this.selectedDate = '';
    this.currentDayIndex = -1;
    this.viewMode = 'days';
    await this.loadAllDays();
    window.history.replaceState({}, '', '/home?tripId=' + this.selectedTrip.id);
    this.cdr.detectChanges();
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
      dayEnd: "23:59",
      locationContext: this.autofillLocation
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
      this.autofillLocation = '';
    } catch (err) {
      console.error("Autofill error:", err);
      alert("Autofill failed.");
    } finally {
      this.isAutofilling = false;
      this.cdr.detectChanges();
    }
  }

  async createAITrip() {
    if (!this.aiTripLocation.trim()) {
      alert('Please enter a location for the AI generated trip.');
      return;
    }
    if (this.days.length === 0) {
      alert('Please add at least one day to the trip first before proceeding.');
    }
    this.isCreatingAITrip = true;
    this.cdr.detectChanges();

    try {
      for (const day of this.days) {
        // Load entire day from Firebase to get existing activities
        const loadedDay = await this.loadDayFromFirebase(day.date);
        const existingActivities = loadedDay?.activities ?? [];

        const emptySlots = [{ start: '00:00', end: '23:59' }];

        const payload = {
          existingActivities,
          emptySlots,
          dayStart: '00:00',
          dayEnd: '23:59',
          locationContext: this.aiTripLocation.trim()
        };

        try {
          const response = await this.aiService.autofillDay(payload);
          let cleanJson = response.result;
          if (typeof cleanJson === 'string') {
            cleanJson = cleanJson.replace(/```json/g, '').replace(/```/g, '').trim();
          }
          const parsed = JSON.parse(cleanJson);

          if (!parsed.activities || !Array.isArray(parsed.activities)) continue;

          day.activities = existingActivities;

          const newActivities = parsed.activities.slice(0, 4);
          for (const act of newActivities) {
            if (act.name && act.start && act.end) {
              this.insertAIActivity(day, act);
            }
          }
          await this.saveDayToFirebase(day);
        } catch (err) {
          console.error(`Failed to autofill day ${day.date}:`, err);
        }
      }
      this.aiTripLocation = '';
      alert('AI Trip creation complete!');
    } finally {
      this.isCreatingAITrip = false;
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
      coords: aiActivity.coords || null,
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

  startEditTripName() {
    this.editTripNameValue = this.selectedTrip?.name || '';
    this.isEditingTripName = true;
    this.cdr.detectChanges();
  }

  cancelEditTripName() {
    this.isEditingTripName = false;
    this.cdr.detectChanges();
  }

  async saveEditTripName() {
    const newName = this.editTripNameValue.trim();
    if (!newName) {
      alert('Create a trip name.');
      return;
    }
    const duplicate = this.trips.some(t =>
      t.name.toLowerCase() === newName.toLowerCase() && t.id !== this.selectedTrip!.id
    );
    if (duplicate) {
      alert('A trip with this name already exists.');
      return;
    }
    const uid = this.auth.uid;
    await setDoc(doc(this.firestore, 'users', uid, 'trips', this.selectedTrip!.id), {name: newName});
    this.selectedTrip!.name = newName;
    const tripInList = this.trips.find(t => t.id === this.selectedTrip!.id);
    if (tripInList) tripInList.name = newName;
    this.isEditingTripName = false;
    this.cdr.detectChanges();
  }

  async deleteTrip(trip: Trip, event: Event) {
    event.stopPropagation();

    if (!confirm(`You are about to delete the entire trip, "${trip.name}". This also deletes any associated data like dates and activities. This cannot be reversed.`)) {
    return;
  }

  const uid = this.auth.uid;
  if (!uid) return;

  const tripRef = doc(this.firestore, 'users', uid, 'trips', trip.id);
  const daysCollectionRef = collection(this.firestore, 'users', uid, 'trips', trip.id, 'days');

  try {
    const daysSnapshot = await getDocs(daysCollectionRef);

    const deletePromises = daysSnapshot.docs.map(dayDoc => deleteDoc(dayDoc.ref));
    await Promise.all(deletePromises);

    await deleteDoc(tripRef);

    this.trips = this.trips.filter(t => t.id !== trip.id);

    if (this.selectedTrip?.id === trip.id) {
      this.backToTrips();
    } else {
      this.cdr.detectChanges();
    }

    alert('Trip and associated data has been deleted.');
  } catch (error) {
    console.error("Error deleting trip:", error);
    alert('Failed to delete trip. Please try again.');
  }
}

  startEditDayDate(day: DayPlan) {
    this.editDayDateValue = day.date;
    this.isEditingDayDate = true;
    this.cdr.detectChanges();
  }

  cancelEditDayDate() {
    this.isEditingDayDate = false;
    this.cdr.detectChanges();
  }

  async saveEditDayDate(day: DayPlan) {
    const newDate = this.editDayDateValue;
    if (!newDate) {
      alert('Please select a valid date.');
      return;
    }
    if (newDate === day.date) {
      this.isEditingDayDate = false;
      return;
    }
    const duplicate = this.days.some(d => d.date === newDate);
    if (duplicate) {
      alert(`A day for ${newDate} already exists in this trip.`);
      return;
    }
    const uid = this.auth.uid;
    const newDocRef = doc(this.firestore, 'users', uid, 'trips', this.selectedTrip!.id, 'days', newDate);
    await setDoc(newDocRef, { date: newDate, activities: day.activities });

    // Delete old date
    const oldDocRef = doc(this.firestore, 'users', uid, 'trips', this.selectedTrip!.id, 'days', day.date);
    await deleteDoc(oldDocRef);

    day.date = newDate;
    this.selectedDate = newDate;
    this.isEditingDayDate = false;
    window.history.replaceState({}, '', `/day/${newDate}?tripId=${this.selectedTrip?.id}`);
    this.cdr.detectChanges();
  }
}