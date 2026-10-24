import { GPS_CONFIG } from './config';

/** Uma única inscrição; callbacks atrasados são ignorados inclusive após reinício. */
export class GeolocationWatch {
  private id: number | null = null;
  private generation = 0;
  constructor(private readonly api: Geolocation) {}

  start(success: PositionCallback, error: PositionErrorCallback) {
    if (this.id !== null) return;
    const generation = ++this.generation;
    const id = this.api.watchPosition(
      (position) => {
        if (generation === this.generation) success(position);
      },
      (failure) => {
        if (generation === this.generation) error(failure);
      },
      GPS_CONFIG.positionOptions,
    );
    if (generation === this.generation) this.id = id;
    else this.api.clearWatch(id);
  }

  stop() {
    this.generation++;
    if (this.id !== null) this.api.clearWatch(this.id);
    this.id = null;
  }
}
