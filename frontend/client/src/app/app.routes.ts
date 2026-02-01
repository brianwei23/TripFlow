import { Routes } from '@angular/router';
import { LoginComponent } from './pages/login/login';
import { RegisterComponent } from './pages/register/register';
import { HomeComponent } from './pages/home/home';
import { MapPicker } from './pages/map-picker/map-picker';
import { AuthGuard } from './services/auth.guard';

export const routes: Routes = [
    { path: 'login', component: LoginComponent },
    { path: 'register', component: RegisterComponent },
    { path: 'home', component: HomeComponent, canActivate: [AuthGuard] }, // AuthGuard prevents back button usage after logout
    { path: 'day/:date', component: HomeComponent, canActivate: [AuthGuard] },
    { path: 'map-picker', component: MapPicker},
    // Default path
    { path: '', redirectTo: 'login', pathMatch: 'full' }
];
