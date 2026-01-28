import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../services/auth.service';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';

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
  imports: [FormsModule, CommonModule],
  standalone: true,
  templateUrl: './home.html',
  styleUrls: ['./home.css'],
})
export class HomeComponent {
  days: DayPlan[] = [];

  private auth = inject(AuthService);
  private router = inject(Router);

  showTimePicker = false;
  tempStartTime = '';
  tempEndTime = '';

  selectedDate: string = '';
  firstDayAdded: boolean = false;

  // Time format
  public formatHourString(time24: string): string {
    if (!time24) return '';
    const [hourStr, minute] = time24.split(':');
    let hour = parseInt(hourStr, 10);
    const period = hour >= 12 ? 'PM' : 'AM';
    hour = hour % 12 === 0 ? 12 : hour % 12;
    return `${hour}:${minute} ${period}`;
  }

  // Create hour slots
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

  saveActivity(slot: HourSlot) {
    const act = slot.tempActivity;

    if (!act || !act.name) return;

    if (act.start && act.end && act.start >= act.end) {
      alert('Activity start time must be before end time.');
      return;
    }

    slot.activities.push({...act});

    slot.tempActivity = { name: '', start: '', end: '', budget: undefined };
    slot.isEditing = false;
  }

  confirmTimeRange() {
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
    this.days.push({
      date: this.selectedDate,
      startTime: this.tempStartTime,
      endTime: this.tempEndTime,
      slots: this.generateHourSlots(this.tempStartTime, this.tempEndTime)
    });

    // Resetting the picker values
    this.showTimePicker = false;
    this.tempStartTime = '';
    this.tempEndTime = '';
    this.selectedDate = '';
    this.firstDayAdded = true;
  }

  navigateToDayPage(direction: 'next' | 'prev') {
    this.router.navigate([`/add-day/${direction}`]);
  }

  logout() {
    this.auth.logout().then(() => {
      this.router.navigate(['/login']);
    }).catch(err => alert(err.message));
  }
}