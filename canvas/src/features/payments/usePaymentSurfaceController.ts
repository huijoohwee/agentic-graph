import React from 'react'
import {
  getPaymentSurfaceController,
  type PaymentSurfaceController,
  type PaymentSurfaceControllerView,
} from './paymentSurfaceController'

export const usePaymentSurfaceController = (
  suppliedController?: PaymentSurfaceController,
  active = true,
): Readonly<{
  controller: PaymentSurfaceController
  view: PaymentSurfaceControllerView
}> => {
  const controller = suppliedController || getPaymentSurfaceController()
  const view = React.useSyncExternalStore(
    controller.subscribe,
    controller.getView,
    controller.getView,
  )

  React.useEffect(
    () => active ? controller.start() : undefined,
    [active, controller],
  )

  return Object.freeze({ controller, view })
}
