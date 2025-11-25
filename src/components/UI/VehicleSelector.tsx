import React from 'react';
import { VehicleType } from '../../constants';

interface VehicleSelectorProps {
  onSelect: (vehicleType: VehicleType | null) => void;
  currentVehicle: VehicleType | null;
}

const VehicleSelector: React.FC<VehicleSelectorProps> = ({ onSelect, currentVehicle }) => {
  const vehicles = [
    { type: null, icon: '🚶', label: 'Foot' },
    { type: VehicleType.BICYCLE, icon: '🚲', label: 'Bicycle' },
    { type: VehicleType.MOTORBIKE, icon: '🏍️', label: 'Motorbike' },
    { type: VehicleType.SEDAN, icon: '🚗', label: 'Truck' },
  ];

  return (
    <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 flex gap-2 bg-black/60 p-2 rounded-lg border border-white/20">
      {vehicles.map((v) => (
        <button
          key={v.label}
          onClick={() => onSelect(v.type)}
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
    </div>
  );
};

export default VehicleSelector;
