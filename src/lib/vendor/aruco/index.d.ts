export const AR: {
  Dictionary: new (name: string) => { generateSVG(id: number): string; codeList: string[]; markSize: number };
  Detector: new (config?: { dictionaryName?: string; maxHammingDistance?: number }) => {
    detect(image: { width: number; height: number; data: Uint8ClampedArray }): { id: number; corners: { x: number; y: number }[]; hammingDistance: number }[];
  };
};
