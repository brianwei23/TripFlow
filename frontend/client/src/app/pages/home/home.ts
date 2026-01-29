import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../services/auth.service';
import { Router, ActivatedRoute, RouterModule } from '@angular/router';
import { CommonModule } from '@angular/common';
import { Firestore, collection, doc, getDoc, setDoc } from '@angular/fire/firestore';

interface HourSlot {
  hourLabel: string;
  activities: Activity[];
  tempActivity: Activity;
  isEditing: boolean;
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

@Component({
  selector: 'app-home',
  imports: [FormsModule, CommonModule, RouterModule],
  standalone: true,
  templateUrl: './home.html',
  styleUrls: ['./home.css'],
})
export class HomeComponent {
  days: DayPlan[] = [];

  private auth = inject(AuthService);
  private router = inject(Router);

  private firestore = inject(Firestore);

  showTimePicker = false;
  tempStartTime = '';
  tempEndTime = '';

  currentDayIndex: number = -1;

  selectedDate: string = '';
  firstDayAdded: boolean = false;

  private route = inject(ActivatedRoute);

  ngOnInit() {
    this.route.params.subscribe(async params => {
      const dateParam = params['date'];
      if(!dateParam) return;

      this.selectedDate = dateParam;

      const dayFromDb = await this.loadDayFromFirebase(dateParam);
      if (dayFromDb) {
        this.days = [dayFromDb];
        this.showTimePicker = false;
      } else {
        this.showTimePicker = true;
        this.days = [];
      }
    });
  }

  async saveDayToFirebase(day: DayPlan) {
    const docRef = doc(this.firestore, 'days', day.date);
    await setDoc(docRef, day);
  }

  async loadDayFromFirebase(date: string): Promise<DayPlan | null> {
    const docRef = doc(this.firestore, 'days', date);
    const docSnap = await getDoc(docRef);
    return docSnap.exists() ? (docSnap.data() as DayPlan) : null;
  }

  showCurrentDay() {
    return this.currentDayIndex >= 0 && this.currentDayIndex < this.days.length
      ? [this.days[this.currentDayIndex]]
      : [];
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
    
    const newDay: DayPlan = {
      date: this.selectedDate,
      startTime: this.tempStartTime,
      endTime: this.tempEndTime,
      slots: this.generateHourSlots(this.tempStartTime, this.tempEndTime)
    };

    await this.saveDayToFirebase(newDay);

    // Resetting the picker values
    this.showTimePicker = false;
    this.tempStartTime = '';
    this.tempEndTime = '';
    this.days = [newDay];
  }

  navigateToDay(direction: 'next' | 'prev') {
    const current = new Date(this.selectedDate);
    if (direction === 'next') current.setDate(current.getDate() + 1);
    else current.setDate(current.getDate() - 1);

    const newDate = current.toISOString().split('T')[0];
    this.router.navigate(['/day', newDate]);
  }

  logout() {
    this.auth.logout().then(() => {
      this.router.navigate(['/login']);
    }).catch(err => alert(err.message));
  }
}