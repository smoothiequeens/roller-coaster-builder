import { create } from "zustand";
import * as THREE from "three";

export type CoasterMode = "build" | "ride" | "preview";

export interface TrackPoint {
  id: string;
  position: THREE.Vector3;
  tilt: number;
}

interface RollerCoasterState {
  mode: CoasterMode;
  trackPoints: TrackPoint[];
  selectedPointId: string | null;
  rideProgress: number;
  isRiding: boolean;
  rideSpeed: number;
  isDraggingPoint: boolean;
  isAddingPoints: boolean;
  isLooped: boolean;
  hasChainLift: boolean;
  showWoodSupports: boolean;
  isNightMode: boolean;
  cameraTarget: THREE.Vector3 | null;
  
  setMode: (mode: CoasterMode) => void;
  setCameraTarget: (target: THREE.Vector3 | null) => void;
  addTrackPoint: (position: THREE.Vector3) => void;
  updateTrackPoint: (id: string, position: THREE.Vector3) => void;
  updateTrackPointTilt: (id: string, tilt: number) => void;
  removeTrackPoint: (id: string) => void;
  createLoopAtPoint: (id: string) => void;
  selectPoint: (id: string | null) => void;
  clearTrack: () => void;
  setRideProgress: (progress: number) => void;
  setIsRiding: (riding: boolean) => void;
  setRideSpeed: (speed: number) => void;
  setIsDraggingPoint: (dragging: boolean) => void;
  setIsAddingPoints: (adding: boolean) => void;
  setIsLooped: (looped: boolean) => void;
  setHasChainLift: (hasChain: boolean) => void;
  setShowWoodSupports: (show: boolean) => void;
  setIsNightMode: (night: boolean) => void;
  startRide: () => void;
  stopRide: () => void;
}

let pointCounter = 0;

export const useRollerCoaster = create<RollerCoasterState>((set, get) => ({
  mode: "build",
  trackPoints: [],
  selectedPointId: null,
  rideProgress: 0,
  isRiding: false,
  rideSpeed: 1.0,
  isDraggingPoint: false,
  isAddingPoints: true,
  isLooped: false,
  hasChainLift: true,
  showWoodSupports: false,
  isNightMode: false,
  cameraTarget: null,
  
  setMode: (mode) => set({ mode }),
  
  setCameraTarget: (target) => set({ cameraTarget: target }),
  
  setIsDraggingPoint: (dragging) => set({ isDraggingPoint: dragging }),
  
  setIsAddingPoints: (adding) => set({ isAddingPoints: adding }),
  
  setIsLooped: (looped) => set({ isLooped: looped }),
  
  setHasChainLift: (hasChain) => set({ hasChainLift: hasChain }),
  
  setShowWoodSupports: (show) => set({ showWoodSupports: show }),
  
  setIsNightMode: (night) => set({ isNightMode: night }),
  
  addTrackPoint: (position) => {
    const id = `point-${++pointCounter}`;
    set((state) => ({
      trackPoints: [...state.trackPoints, { id, position: position.clone(), tilt: 0 }],
    }));
  },
  
  updateTrackPoint: (id, position) => {
    set((state) => ({
      trackPoints: state.trackPoints.map((point) =>
        point.id === id ? { ...point, position: position.clone() } : point
      ),
    }));
  },
  
  updateTrackPointTilt: (id, tilt) => {
    set((state) => ({
      trackPoints: state.trackPoints.map((point) =>
        point.id === id ? { ...point, tilt } : point
      ),
    }));
  },
  
  removeTrackPoint: (id) => {
    set((state) => ({
      trackPoints: state.trackPoints.filter((point) => point.id !== id),
      selectedPointId: state.selectedPointId === id ? null : state.selectedPointId,
    }));
  },
  
  createLoopAtPoint: (id) => {
    set((state) => {
      const pointIndex = state.trackPoints.findIndex((p) => p.id === id);
      if (pointIndex === -1) return state;
      
      const entryPoint = state.trackPoints[pointIndex];
      const entryPos = entryPoint.position.clone();
      
      // Calculate forward direction from track
      let forward = new THREE.Vector3(1, 0, 0);
      if (pointIndex > 0) {
        const prevPoint = state.trackPoints[pointIndex - 1];
        forward = entryPos.clone().sub(prevPoint.position);
        forward.y = 0;
        if (forward.length() < 0.1) {
          forward = new THREE.Vector3(1, 0, 0);
        }
        forward.normalize();
      }
      
      const loopRadius = 8;
      const halfPoints = 10; // Points for each half of the loop
      const loopPoints: TrackPoint[] = [];
      const exitSeparation = 2.5; // Small lateral offset to prevent overlap with entry track
      
      // Compute right vector (perpendicular to forward in horizontal plane)
      const up = new THREE.Vector3(0, 1, 0);
      const right = new THREE.Vector3().crossVectors(forward, up).normalize();
      
      // Build ascending half (entry to top): θ from 0 to π
      const ascendingOffsets: { forward: number; vertical: number }[] = [];
      for (let i = 1; i <= halfPoints; i++) {
        const t = i / halfPoints; // 0 to 1 over first half
        const theta = t * Math.PI; // 0 to π
        
        const forwardOffset = Math.sin(theta) * loopRadius;
        const verticalOffset = (1 - Math.cos(theta)) * loopRadius;
        
        ascendingOffsets.push({ forward: forwardOffset, vertical: verticalOffset });
        
        loopPoints.push({
          id: `point-${++pointCounter}`,
          position: new THREE.Vector3(
            entryPos.x + forward.x * forwardOffset,
            entryPos.y + verticalOffset,
            entryPos.z + forward.z * forwardOffset
          ),
          tilt: 0
        });
      }
      
      // Build descending half with small lateral offset to avoid overlap
      for (let i = halfPoints - 1; i >= 1; i--) {
        const mirrorT = (halfPoints - i) / halfPoints; // 0 to 1 as we descend
        const theta = Math.PI + mirrorT * Math.PI; // π to 2π
        
        const forwardOffset = Math.sin(theta) * loopRadius;
        const verticalOffset = (1 - Math.cos(theta)) * loopRadius;
        
        // Gradually add lateral offset as we descend (smooth ease-in)
        const lateralT = mirrorT * mirrorT; // Quadratic ease
        const lateralOffset = lateralT * exitSeparation;
        
        loopPoints.push({
          id: `point-${++pointCounter}`,
          position: new THREE.Vector3(
            entryPos.x + forward.x * forwardOffset + right.x * lateralOffset,
            entryPos.y + verticalOffset,
            entryPos.z + forward.z * forwardOffset + right.z * lateralOffset
          ),
          tilt: 0
        });
      }
      
      // Get the next point (unchanged) so we can rejoin it
      const nextPoint = state.trackPoints[pointIndex + 1];
      
      // Loop exit position (last point of loop) - should be very close to entry
      const loopExit = loopPoints[loopPoints.length - 1].position.clone();
      
      // Create smooth transition points using cubic Hermite interpolation
      const transitionPoints: TrackPoint[] = [];
      if (nextPoint) {
        const nextPos = nextPoint.position.clone();
        
        // Exit tangent: loop exits going forward (same direction as entry)
        const exitTangent = forward.clone();
        
        // Target tangent: direction toward next point
        const toNext = nextPos.clone().sub(loopExit);
        const targetTangent = toNext.clone().normalize();
        
        // Distance for transition
        const dist = toNext.length();
        
        // Create 3 transition points with Hermite blending
        for (let i = 1; i <= 3; i++) {
          const t = i / 4; // 0.25, 0.5, 0.75
          
          // Hermite basis functions
          const h00 = 2*t*t*t - 3*t*t + 1;
          const h10 = t*t*t - 2*t*t + t;
          const h01 = -2*t*t*t + 3*t*t;
          const h11 = t*t*t - t*t;
          
          // Tangent scaling (use distance as tangent magnitude)
          const tangentScale = dist * 0.5;
          
          const px = h00 * loopExit.x + h10 * exitTangent.x * tangentScale + 
                     h01 * nextPos.x + h11 * targetTangent.x * tangentScale;
          const py = h00 * loopExit.y + h10 * exitTangent.y * tangentScale + 
                     h01 * nextPos.y + h11 * targetTangent.y * tangentScale;
          const pz = h00 * loopExit.z + h10 * exitTangent.z * tangentScale + 
                     h01 * nextPos.z + h11 * targetTangent.z * tangentScale;
          
          transitionPoints.push({
            id: `point-${++pointCounter}`,
            position: new THREE.Vector3(px, py, pz),
            tilt: 0
          });
        }
      }
      
      // Combine: original up to entry + loop + transitions + original remainder (unchanged)
      const newTrackPoints = [
        ...state.trackPoints.slice(0, pointIndex + 1),
        ...loopPoints,
        ...transitionPoints,
        ...state.trackPoints.slice(pointIndex + 1)
      ];
      
      return { trackPoints: newTrackPoints };
    });
  },
  
  selectPoint: (id) => set({ selectedPointId: id }),
  
  clearTrack: () => {
    set({ trackPoints: [], selectedPointId: null, rideProgress: 0, isRiding: false });
  },
  
  setRideProgress: (progress) => set({ rideProgress: progress }),
  
  setIsRiding: (riding) => set({ isRiding: riding }),
  
  setRideSpeed: (speed) => set({ rideSpeed: speed }),
  
  startRide: () => {
    const { trackPoints } = get();
    if (trackPoints.length >= 2) {
      set({ mode: "ride", isRiding: true, rideProgress: 0 });
    }
  },
  
  stopRide: () => {
    set({ mode: "build", isRiding: false, rideProgress: 0 });
  },
}));
