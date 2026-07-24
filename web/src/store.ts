import {create} from "zustand";

interface ConsoleState {
  cluster: string;
  setCluster: (cluster: string) => void;
  technicalDetails: boolean;
  toggleTechnicalDetails: () => void;
}

export const useConsoleStore = create<ConsoleState>((set) => ({
  cluster: "demo",
  setCluster: (cluster) => set({cluster}),
  technicalDetails: false,
  toggleTechnicalDetails: () => set((state) => ({technicalDetails: !state.technicalDetails}))
}));

