import React, { useCallback } from 'react';
import IconButton from '@/components/IconButton';
import { DESIGN_ICONS } from '@agentic-base/views-react/controls'
import { getIconSizeClass } from '@/lib/ui';
import { UI_COPY, UI_LABELS } from '@/lib/config';
import { useToolbarState } from '@/features/toolbar/hooks/useToolbarState';
import {
  uiPrimaryIconActiveClassName,
  uiPrimaryIconInactiveClassName,
} from '@/features/toolbar/ui/toolbarStyles'

export const PinToViewButton = () => {
  const {
    viewPinned,
    setViewPinned,
    uiIconScale,
    uiIconStrokeWidth,
  } = useToolbarState();

  const handleTogglePinned = useCallback(() => {
    setViewPinned(!viewPinned);
  }, [viewPinned, setViewPinned]);

  const iconSizeClass = getIconSizeClass(uiIconScale);

  return (
    <IconButton
      className={`App-toolbar__btn ${viewPinned ? uiPrimaryIconActiveClassName : uiPrimaryIconInactiveClassName}`}
      title={UI_LABELS.pinToView}
      tooltipContent={UI_COPY.pinToViewTooltip}
      onClick={handleTogglePinned}
      showTooltip
    >
      <DESIGN_ICONS.Pin className={iconSizeClass} strokeWidth={uiIconStrokeWidth} />
    </IconButton>
  );
};
