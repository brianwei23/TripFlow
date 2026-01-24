import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NgFor } from '@angular/common';
import { AuthService } from '../../services/auth.service';
import { Router } from '@angular/router';

@Component({
  selector: 'app-home',
  imports: [FormsModule, NgFor],
  standalone: true,
  templateUrl: './home.html',
  styleUrls: ['./home.css'],
})
export class HomeComponent {
  days: { date: string; activity: string; plannedBudget: number }[] = [];

  private auth = inject(AuthService);
  private router = inject(Router);

  // Add column which represents a day
  addDay() {
    this.days.push({ date: '', activity: '', plannedBudget: 0 });
  }

  logout() {
    this.auth.logout().then(() => {
      this.router.navigate(['/login']);
    }).catch(err => alert(err.message));
  }
}
