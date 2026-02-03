import { Component, inject, ChangeDetectorRef } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../services/auth.service';
import { Router, ActivatedRoute, RouterModule } from '@angular/router';
import { CommonModule } from '@angular/common';
import { Firestore } from '@angular/fire/firestore';
import { collection, doc, getDoc, getDocs, setDoc, deleteDoc } from 'firebase/firestore';


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
  id?: string; // For activities with duplicate names
  start?: string;
  end?: string;
  expectedCost?: number;
  location?: string;
  actualCost?: number | null;
  isEditing?: boolean;
  temp?: Activity;
}


interface DayPlan {
  date: string;
  startTime: string;
  endTime: string;
  slots: HourSlot[];
  isEditingTime?: boolean;
  tempStartTime?: string;
  tempEndTime?: string;
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

        let navState = history.state as any;

        if (navState && navState.preloadedDay && navState.preloadedDay.date === dateParam) {
          this.days = [navState.preloadedDay];
          this.currentDayIndex = 0;
          this.firstDayAdded = true;
          this.showTimePicker = false;
        } else {
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
      }

        if (navState?.editingActivity) {
          const editingAct = this.days
            .flatMap(d => d.slots)
            .flatMap(s => s.activities)
            .find(a => a.id === navState.editingActivity?.id);
          if (editingAct) {
            editingAct.isEditing = true;

            editingAct.temp = {
              ...editingAct.temp,
              ...navState.editingActivity
            };

            // Apply picked location
            if (navState.pickedLocation) editingAct.temp!.location = navState.pickedLocation;
          }
        }
        if (navState?.isNewActivity && navState.slotHourLabel && this.days.length) {
          const slot = this.days[0].slots.find(
            s => s.hourLabel === navState.slotHourLabel
          );
          if (slot) {
            if (navState.tempActivity) slot.tempActivity = { ...navState.tempActivity };
            if (navState.pickedLocation) slot.tempActivity.location = navState.pickedLocation;
            slot.isEditing = true;
          }
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
        this.showTimePicker = false;
      }  
      this.cdr.detectChanges(); // Force UI refresh after any route change/data load
      });
  }


  async saveDayToFirebase(day: DayPlan) {
    const uid = this.auth.uid;
    if (!uid) return;

    const sanitizedDay: PersistedDayPlan = {
      date: day.date,
      startTime: day.startTime,
      endTime: day.endTime,
      slots: day.slots.map(slot => ({
        hourLabel: slot.hourLabel,
        activities: slot.activities.map(act => ({
          name: act.name,
          id: act.id || Date.now().toString() + Math.random().toString(36).slice(2, 11),
          start: act.start,
          end: act.end,
          expectedCost: act.expectedCost,
          location: act.location || '',
          actualCost: act.actualCost !== undefined ? act.actualCost : null
        }))
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
        tempActivity: {name: '', start: '', end: '', expectedCost: undefined, actualCost: null},
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


  startEditTime(day: DayPlan) {
    day.isEditingTime = true;
    day.tempStartTime = day.startTime;
    day.tempEndTime = day.endTime;
    this.cdr.detectChanges();
  }


  cancelEditTime(day: DayPlan) {
    day.isEditingTime = false;
    this.cdr.detectChanges();
  }


  async saveTimeRange(day: DayPlan) {
    if (!day.tempStartTime || !day.tempEndTime) {
      alert('Both times are required.');
      return;
    }


    if (day.tempStartTime >= day.tempEndTime) {
      alert('Start time must be before end time.');
      return;
    }


    const userConfirmed = confirm(
      'EDITING THE TIME RANGE CAN DELETE ALL YOUR ACTIVITIES.'
    );


    if (!userConfirmed) {
      return;
    }


    const newSlots = this.generateHourSlots(
      day.tempStartTime,
      day.tempEndTime
    );


    // Preserve actvities that still fit
    for (const oldSlot of day.slots) {
      for (const act of oldSlot.activities) {
        if(!act.start || !act.end) continue;


        const fits = newSlots.find(s => {
          const [sStart, sEnd] = s.hourLabel.split(' - ');
          const start24 = this.parseHourLabelTo24(sStart);
          const end24 = this.parseHourLabelTo24(sEnd);
          return act.start! >= start24 && act.start! < end24;
        });
        if (fits) {
          fits.activities.push(act);
        }
      }
    }

    // Sort activities inside each slot by start time
    newSlots.forEach(s => s.activities.sort((a, b) => a.start!.localeCompare(b.start!)));


    day.startTime = day.tempStartTime;
    day.endTime = day.tempEndTime;
    day.slots = newSlots;
    day.isEditingTime = false;


    await this.saveDayToFirebase(day);
    this.cdr.detectChanges();
  }


  editActivity(act: Activity) {
    act.isEditing = true;
    act.temp = {
      name: act.name,
      start: act.start,
      end: act.end,
      expectedCost: act.expectedCost,
      location: act.location,
      actualCost: act.actualCost
    };
    this.cdr.detectChanges();
  }


  cancelEditActivity(act: Activity) {
    act.isEditing = false;
    this.cdr.detectChanges();
  }


  saveEditedActivity(day: DayPlan, slot: HourSlot, act: Activity) {
    const temp = act.temp;
    if (!temp) return;
    if (!temp.name || !temp.start || !temp.end || temp.expectedCost == undefined || temp.expectedCost == null) {
      alert('Activity name, times, and expected cost must be filled.');
      return;
    }
    if (temp.expectedCost < 0) {
      alert('Cost cannot be less than 0.')
      return;
    }
    if (temp.start >= temp.end) {
      alert('Start time must be before end time');
      return;
    }  


    const [slotStartStr, slotEndStr] = slot.hourLabel.split(' - ');
    const slotStart = this.parseHourLabelTo24(slotStartStr);
    const slotEnd = this.parseHourLabelTo24(slotEndStr);


    if (temp.start < slotStart || temp.start > slotEnd) {
      alert(`Activity start time must be with the hour slot.`);
      return;
    }


    act.name = temp.name;
    act.start = temp.start;
    act.end = temp.end;
    act.expectedCost = temp.expectedCost;
    act.location = temp.location;
    act.actualCost = temp.actualCost;
    act.isEditing = false;
    act.temp = undefined;


    this.saveDayToFirebase(day);
    this.cdr.detectChanges();
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
        tempActivity: {name: '', start: '', end: '', expectedCost: 0}
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


  saveActivity(day: DayPlan, slot: HourSlot) {
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


    if (act.expectedCost === undefined || act.expectedCost === null || act.expectedCost < 0) {
      alert('Please enter a valid expected cost.');
      return;
    }

    const [slotStartStr, slotEndStr] = slot.hourLabel.split(' - ');

    const slotStart = this.parseHourLabelTo24(slotStartStr);
    const slotEnd = this.parseHourLabelTo24(slotEndStr);

    if (act.start < slotStart || act.start > slotEnd) {
      alert(`Start time must be within the slot time range: ${slot.hourLabel}`);
      return;
    }

    const finalActivity: Activity = {
      ...act,
      id: act.id || Date.now().toString() + Math.random().toString(36).slice(2, 11)
    };

    slot.activities.push(finalActivity);


    // Sort the activities by start time
    slot.activities.sort((a, b) => {
      if (!a.start) return 1;
      if (!b.start) return -1;
      return a.start.localeCompare(b.start);
    });

    slot.tempActivity = { name: '', start: '', end: '', expectedCost: undefined, actualCost: null };
    slot.isEditing = false;
    window.history.replaceState({}, '');
    this.saveDayToFirebase(day);
    // Force Angular to see changes
    this.cdr.detectChanges();
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
          tempActivity: { name: '', start: '', end: '', expectedCost: undefined, actualCost: null }
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


  openMapForActivity(act: Activity) {
    if (!act.temp) act.temp = {...act};
    this.router.navigate(['/map-picker'], {
      state: { date: this.selectedDate, editingActivity: {...act.temp, id: act.id}}
    });
  }

  openMapForNewActivity(slot: HourSlot) {
    this.router.navigate(['/map-picker'], {
      state: {
        date: this.selectedDate,
        isNewActivity: true,
        slotHourLabel: slot.hourLabel,
        tempActivity: slot.tempActivity
      }
    });
  }

  toggleAddForm(slot: HourSlot) {
    this.days[0]?.slots.forEach(s => s.isEditing = false);
    slot.isEditing = true;
    this.cdr.detectChanges();
  }

  cancelAddActivity(slot: HourSlot) {
    slot.isEditing = false;
    slot.tempActivity = {
      name: '',
      start: '',
      end: '',
      expectedCost: undefined,
      actualCost: null,
      location: ''
    };
    this.cdr.detectChanges();
  }


  logout() {
    this.auth.logout().then(() => {
      this.router.navigate(['/login']);
    }).catch(err => alert(err.message));
  }


  deleteActivity(day: DayPlan, slot: HourSlot, act: Activity) {
    const confirmDelete = confirm(`Delete activity "${act.name}"?`);
    if (!confirmDelete) return;

    slot.activities = slot.activities.filter(a => a !== act);
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
}
