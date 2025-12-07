import React from 'react';
import { VehicleType } from '../../constants';

interface VehicleSelectorProps {
  onSelect: (vehicleType: VehicleType | null) => void;
  currentVehicle: VehicleType | null;
  onTriggerRampage?: () => void;
}

// PERF: Static vehicle list (outside component to avoid recreation)
const VEHICLES = [
  { type: null, icon: '🚶', label: 'Foot' },
  { type: VehicleType.BICYCLE, icon: '🚲', label: 'Bicycle' },
  { type: VehicleType.MOTORBIKE, icon: '🏍️', label: 'Motorbike' },
  { type: VehicleType.SEDAN, icon: '🚗', label: 'Car' },
  { type: VehicleType.TRUCK, icon: '🚛', label: '18-Wheeler' },
] as const;

// PERF: Memoized to prevent re-renders when parent updates
const VehicleSelector: React.FC<VehicleSelectorProps> = React.memo(({ onSelect, currentVehicle, onTriggerRampage }) => {
  return (
    <>
      {VEHICLES.map((v) => (
        <button
          key={v.label}
          onClick={(e) => { onSelect(v.type); (e.target as HTMLButtonElement).blur(); }}
          tabIndex={-1}
          className={`w-12 h-12 flex items-center justify-center text-2xl rounded transition-all ${
            currentVehicle === v.type
              ? 'bg-yellow-500 scale-110 shadow-lg shadow-yellow-500/50'
              : 'bg-white/10 hover:bg-white/20'
          }`}
          title={v.label}
        >
          {v.icon}
        </button>
      ))}
      {/* Rampage trigger button */}
      {onTriggerRampage && (
        <button
          onClick={(e) => { onTriggerRampage(); (e.target as HTMLButtonElement).blur(); }}
          tabIndex={-1}
          className="w-12 h-12 flex items-center justify-center text-2xl rounded transition-all bg-red-600 hover:bg-red-500 hover:scale-110"
          title="Trigger Rampage"
        >
          💀
        </button>
      )}
    </>
  );
});

export default VehicleSelector;
