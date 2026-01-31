import { Component, inject, ChangeDetectorRef } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../services/auth.service';
import { Router, ActivatedRoute, RouterModule } from '@angular/router';
import { CommonModule } from '@angular/common';
import { Firestore } from '@angular/fire/firestore';
import { collection, doc, getDoc, getDocs, setDoc } from 'firebase/firestore';

interface HourSlot {
  hourLabel: string;
  activities: Activity[];
  tempActivity: Activity;
  isEditing: boolean;
}

interface PersistedHourSlot {
  hourLabel: string;
  activities: Activity[];
}

interface Activity {
  name: string;
  start?: string;
  end?: string;
  budget?: number;
}

interface DayPlan {
  date: string;
  startTime: string;
  endTime: string;
  slots: HourSlot[];
}

interface PersistedDayPlan {
  date: string;
  startTime: string;
  endTime: string;
  slots: PersistedHourSlot[];
}

@Component({
  selector: 'app-home',
  imports: [FormsModule, CommonModule, RouterModule],
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

  showTimePicker = false;
  tempStartTime = '';
  tempEndTime = '';
  // Date tiles sort
  sortRecentFirst: boolean = false;

  currentDayIndex: number = -1;

  selectedDate: string = '';
  firstDayAdded: boolean = false;

  private route = inject(ActivatedRoute);


  isHomePage: boolean = false;

  ngOnInit() {
    this.route.params.subscribe(async params => {
      const dateParam = params['date'];
      
      if (dateParam) {
        this.isHomePage = false;

        this.selectedDate = dateParam;

        const navState = history.state as {preloadedDay: DayPlan};

        if (navState && navState.preloadedDay && navState.preloadedDay.date === dateParam) {
          console.log('Loading day from Route State (Immediate)');
          this.days = [navState.preloadedDay];
          this.currentDayIndex = 0;
          this.firstDayAdded = true;
          this.showTimePicker = false;
          this.cdr.detectChanges(); // Refresh UI
          return;
        }

        console.log('Loading day from Firebase');

        const dayFromDb = await this.loadDayFromFirebase(dateParam);
        if (dayFromDb) {
          this.days = [dayFromDb];
          this.currentDayIndex = 0;
          this.firstDayAdded = true;
          this.showTimePicker = false;
        } else {
          this.days = [];
          this.firstDayAdded = false;
          this.showTimePicker = true;
        }
      } else {
        this.isHomePage = true;
        this.days = [];
        await this.loadAllDays();
        this.showTimePicker = false;
      }
      this.cdr.detectChanges(); // Forc UI refresh after any route change/data load
      });
  }

  async saveDayToFirebase(day: DayPlan) {
    const uid = this.auth.uid;

    const sanitizedDay: PersistedDayPlan = {
      date: day.date,
      startTime: day.startTime,
      endTime: day.endTime,
      slots: day.slots.map(slot => ({
        hourLabel: slot.hourLabel,
        activities: slot.activities
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
      startTime: data.startTime, 
      endTime: data.endTime, 
      slots: data.slots.map(slot => ({ 
        ...slot, 
        isEditing: false, 
        tempActivity: {name: '', start: '', end: '', budget: undefined}, 
        activities: slot.activities ?? []
      }))  
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

  // Time format
  public formatHourString(time24: string): string {
    if (!time24) return '';
    const [hourStr, minute] = time24.split(':');
    let hour = parseInt(hourStr, 10);
    const period = hour >= 12 ? 'PM' : 'AM';
    hour = hour % 12 === 0 ? 12 : hour % 12;
    return `${hour}:${minute} ${period}`;
  }

  private parseHourLabelTo24(label: string): string {
    const [time, period] = label.split(' ');
    let [hour, minute] = time.split(':').map(Number);
    if (period === 'PM' && hour < 12) hour += 12;
    if (period === 'AM' && hour === 12) hour = 0;
    return `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2,'0')}`;
  }

  private generateHourSlots(start: string, end: string): HourSlot[] {
    const slots: HourSlot[] = [];
    let[currentHour, currentMin] = start.split(':').map(Number);
    const [endHour, endMin] = end.split(':').map(Number);

    while (currentHour < endHour || (currentHour === endHour && currentMin < endMin)) {
      // Calculate next hour mark
      let nextHour = currentHour + 1;
      let nextMin = currentMin;
      
      if (nextHour > endHour || (nextHour === endHour && nextMin > endMin)) {
        nextHour = endHour;
        nextMin = endMin;
      }
      const label = `${this.formatHourString(`${String(currentHour).padStart(2, '0')}:${String(currentMin).padStart(2, '0')}`)} - ${this.formatHourString(`${String(nextHour).padStart(2, '0')}:${String(nextMin).padStart(2, '0')}`)}`;
      slots.push({
        hourLabel: label,
        isEditing: false,
        activities: [],
        tempActivity: {name: '', start: '', end: '', budget: 0}
      });
      currentHour = nextHour;
      currentMin = nextMin;
    }
    return slots;
  }

  addDay() {
    // Display time picker after date is selected
    if (!this.selectedDate) {
      alert('Please select a date first.');
      return;
    }
    this.showTimePicker = true;
  }

  addNewDay(direction: 'next'| 'prev') {
    if (direction === 'next') {
      const lastDay = this.days.length ? new Date(this.days[this.days.length - 1].date) : new Date();
      lastDay.setDate(lastDay.getDate() + 1);
      this.selectedDate = lastDay.toISOString().split('T')[0];
    } else {
      const firstDay = this.days.length ? new Date(this.days[0].date) : new Date();
      firstDay.setDate(firstDay.getDate() - 1);
      this.selectedDate = firstDay.toISOString().split('T')[0];
    }
    this.showTimePicker = true;
  }

  saveActivity(slot: HourSlot) {
    const act = slot.tempActivity;

    if (!act || !act.name) return;

    if (!act.start || !act.end) {
      alert('Please enter both start and end times.');
      return;
    }

    if (act.start >= act.end) {
      alert('Activity start time must be before end time.');
      return;
    }

    if (act.budget === undefined || act.budget === null || act.budget < 0) { 
      alert('Please enter a valid budget.'); 
      return; 
    }

    const [slotStartStr, slotEndStr] = slot.hourLabel.split(' - ');

    const slotStart = this.parseHourLabelTo24(slotStartStr);
    const slotEnd = this.parseHourLabelTo24(slotEndStr);

    if (act.start < slotStart || act.start > slotEnd) {
      alert(`Start time must be within the slot time range: ${slot.hourLabel}`);
      return;
    }

    slot.activities.push({...act});

    // Sort the activities by start time
    slot.activities.sort((a, b) => {
      if (!a.start) return 1;
      if (!b.start) return -1;
      return a.start.localeCompare(b.start);
    });

    this.saveDayToFirebase(this.days[0]);

    slot.tempActivity = { name: '', start: '', end: '', budget: undefined };
    slot.isEditing = false;
  }

  async confirmTimeRange() {
    if(!this.selectedDate) {
      alert('Please select a date first.');
      return;
    }
    if (!this.tempStartTime || !this.tempEndTime) {
      alert('You must select both start and end times.');
      return;
    }
    if (this.tempStartTime >= this.tempEndTime) {
      alert('Start time needs to be before the end time.');
      return;
    }

    // Stop duplicate dates
    const existingDay = this.days.find(d => d.date === this.selectedDate);
    if (existingDay) {
      alert('This date already exsits.');
      return;
    }
    
    const newDay: DayPlan = {
      date: this.selectedDate,
      startTime: this.tempStartTime,
      endTime: this.tempEndTime,
      slots: this.generateHourSlots(this.tempStartTime, this.tempEndTime)
    };

    await this.saveDayToFirebase(newDay);

    this.router.navigate(['/day', this.selectedDate], {
      state: {preloadedDay: newDay}
    });
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
        startTime: data.startTime,
        endTime: data.endTime,
        slots: data.slots.map(slot => ({
          hourLabel: slot.hourLabel,
          activities: slot.activities ?? [],
          isEditing: false,
          tempActivity: { name: '', start: '', end: '', budget: undefined }
        }))
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

  logout() {
    this.auth.logout().then(() => {
      this.router.navigate(['/login']);
    }).catch(err => alert(err.message));
  }
}