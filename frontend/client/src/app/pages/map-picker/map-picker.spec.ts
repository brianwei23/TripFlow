import { ComponentFixture, TestBed } from '@angular/core/testing';

import { MapPicker } from './map-picker';

describe('MapPicker', () => {
  let component: MapPicker;
  let fixture: ComponentFixture<MapPicker>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MapPicker]
    })
    .compileComponents();

    fixture = TestBed.createComponent(MapPicker);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
