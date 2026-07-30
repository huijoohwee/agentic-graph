export type ZoomFitIntent = 'fitToView' | 'fitToScreen' | 'initialFit'
export type ZoomRequestOrigin = 'graphActivation'
export type ZoomTransformIntent = 'zoomPreset' | 'naturalInitialization'

export type ZoomCommandType = 'in' | 'out' | 'reset' | 'selection' | 'fit'

export type ZoomRequest =
  | { type: Exclude<ZoomCommandType, 'fit'>; at?: number }
  | { type: 'fit'; intent: ZoomFitIntent; origin?: ZoomRequestOrigin; targetGraphKey?: string; at?: number }
  | { type: 'bounds'; payload: { bounds: { x: number; y: number; w: number; h: number }; insetPx?: number; origin?: { x: number; y: number } }; at?: number }
  | {
      type: 'transform'
      payload: { k: number; x: number; y: number }
      intent?: ZoomTransformIntent
      origin?: ZoomRequestOrigin
      targetGraphKey?: string
      at?: number
    }
