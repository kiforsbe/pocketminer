import { ITEM_DEFINITIONS } from "./inventory.js";
import { TILE_SIZE, TILE_TYPES } from "./tile.js";
import { RendererSubsystem } from "./rendererSubsystem.js";

class RendererUiSection extends RendererSubsystem {
  constructor(uiRenderer) {
    super(uiRenderer.renderer);
    this.uiRenderer = uiRenderer;
  }

  get dom() {
    return this.uiRenderer.dom;
  }

  get state() {
    return this.uiRenderer.state;
  }

  get worldRenderer() {
    return this.uiRenderer.worldRenderer;
  }

  setTextContentIfChanged(element, nextText) {
    if (element && element.textContent !== nextText) {
      element.textContent = nextText;
    }
  }

  setDataAttributeIfChanged(element, name, value) {
    if (!element || element.getAttribute(name) === value) {
      return;
    }

    element.setAttribute(name, value);
  }
}

class RendererUiPerformanceSection extends RendererUiSection {
  updateFrameRateCounter() {
    const now = performance.now();
    if (this.state.lastFrameTimestamp > 0) {
      const deltaMs = now - this.state.lastFrameTimestamp;
      this.state.fpsSampleElapsed += deltaMs;
      this.state.fpsSampleFrames += 1;
      if (this.state.fpsSampleElapsed >= 250) {
        this.state.displayedFps = Math.round((this.state.fpsSampleFrames * 1000) / this.state.fpsSampleElapsed);
        this.state.fpsSampleElapsed = 0;
        this.state.fpsSampleFrames = 0;
      }
    }

    this.state.lastFrameTimestamp = now;
  }

  drawPerformanceCounters(roundInfo = {}) {
    if (!roundInfo.showPerformance) {
      return;
    }

    this.ctx.save();
    this.ctx.font = '600 10px "Segoe UI", "Trebuchet MS", sans-serif';
    this.ctx.textAlign = "right";
    this.ctx.textBaseline = "top";
    this.ctx.fillStyle = "rgba(242, 237, 227, 0.72)";
    this.ctx.strokeStyle = "rgba(6, 10, 16, 0.82)";
    this.ctx.lineWidth = 3;
    this.ctx.lineJoin = "round";
    const x = this.viewport.width - 18;
    const lines = [`FPS ${this.state.displayedFps}`, `TPS ${roundInfo.tickRate ?? 0}`];
    lines.forEach((text, index) => {
      const y = 18 + index * 12;
      this.ctx.strokeText(text, x, y);
      this.ctx.fillText(text, x, y);
    });
    this.ctx.restore();
  }
}

class RendererUiHudSection extends RendererUiSection {
  drawHud(roundInfo) {
    const toastMessage = roundInfo.notification?.message ?? "";
    const toastUrgent = roundInfo.notification?.urgent ? "true" : "false";
    const hudSignature = [
      roundInfo.timeLeft,
      roundInfo.round,
      roundInfo.bank,
      roundInfo.urgent ? 1 : 0,
      toastMessage,
      toastUrgent,
    ].join("|");

    if (hudSignature !== this.state.hudSignature) {
      this.state.hudSignature = hudSignature;
      this.setDataAttributeIfChanged(this.dom.roundTimer, "data-urgent", roundInfo.urgent ? "true" : "false");
      this.setTextContentIfChanged(this.dom.roundTimerValue, `${roundInfo.timeLeft}s`);
      this.setTextContentIfChanged(this.dom.roundValue, String(roundInfo.round));
      this.setTextContentIfChanged(this.dom.bankValue, `${roundInfo.bank}€`);

      if (toastMessage) {
        this.setTextContentIfChanged(this.dom.roundToast, toastMessage);
        this.setDataAttributeIfChanged(this.dom.roundToast, "data-visible", "true");
        this.setDataAttributeIfChanged(this.dom.roundToast, "data-urgent", toastUrgent);
      } else {
        this.setTextContentIfChanged(this.dom.roundToast, "");
        this.setDataAttributeIfChanged(this.dom.roundToast, "data-visible", "false");
        this.setDataAttributeIfChanged(this.dom.roundToast, "data-urgent", "false");
      }
    }

    this.drawBonusStats(this.dom.bonusStats, roundInfo.bonuses);
  }

  drawBonusStats(container, bonuses = {}) {
    if (!container) {
      return;
    }

    const bonusStats = this.getBonusStats(bonuses);
    const signature = bonusStats
      .map(({ label, value, active }) => `${label}:${value}:${active ? 1 : 0}`)
      .join("|");

    if (signature === this.state.bonusStatsSignature) {
      return;
    }

    this.state.bonusStatsSignature = signature;
    container.replaceChildren(...bonusStats.map(({ label, value, active }) => {
      const statEl = document.createElement("div");
      statEl.className = "bonus-stat";
      statEl.setAttribute("data-active", active ? "true" : "false");

      const labelEl = document.createElement("span");
      labelEl.className = "bonus-stat-label";
      labelEl.textContent = label;

      const valueEl = document.createElement("strong");
      valueEl.className = "bonus-stat-value";
      valueEl.textContent = value;

      statEl.append(labelEl, valueEl);
      return statEl;
    }));
  }

  getBonusStats(bonuses = {}) {
    const definitions = [
      { label: "Move", value: bonuses.moveSpeed ?? 0 },
      { label: "Jump", value: bonuses.jumpPower ?? 0 },
      { label: "Swing", value: bonuses.swingRate ?? 0 },
      { label: "Platform", value: bonuses.platformCooldown ?? 0 },
      { label: "Bomb Dmg", value: bonuses.bombDamage ?? 0 },
      { label: "Bomb Load", value: bonuses.bombRestock ?? 0 },
      { label: "Magnet", value: bonuses.pickupMagnetism ?? 0 },
      { label: "Luck", value: bonuses.luck ?? 0 },
      { label: "Mastery", value: bonuses.mastery ?? 0 },
      { label: "Damage", value: bonuses.toolDamage ?? 0 },
    ];

    return definitions.map(({ label, value }) => ({
      label,
      active: Math.abs(value) > 0.0001,
      value: this.formatBonusStatValue(value),
    }));
  }

  formatBonusStatValue(value) {
    const percent = Math.round(value * 100);
    return `${percent >= 0 ? "+" : ""}${percent}%`;
  }
}

class RendererUiSurveySection extends RendererUiSection {
  drawSurveyPanel(player, target) {
    const stratum = this.world.getStratumAtPixel(player.getCenter().y);
    const stratumSignature = [
      stratum.name,
      stratum.depth,
      stratum.base[0]?.type ?? "",
      stratum.primaryOres.map((ore) => ore.type).join(","),
      [...stratum.bonusFromPrev, ...stratum.bonusFromNext].map((ore) => ore.type).join(","),
    ].join("|");

    if (stratumSignature !== this.state.stratumSignature) {
      this.state.stratumSignature = stratumSignature;
      if (this.state.lastStratumIconType !== stratum.base[0].type) {
        this.worldRenderer.paintIcon(this.dom.stratumIcon, stratum.base[0].type);
        this.state.lastStratumIconType = stratum.base[0].type;
      }
      this.setTextContentIfChanged(this.dom.stratumName, stratum.name);
      this.setTextContentIfChanged(this.dom.stratumDepth, `Depth ${stratum.depth}m`);

      if (this.dom.stratumCoreSwatches) {
        this.dom.stratumCoreSwatches.replaceChildren();
        for (const ore of stratum.primaryOres) {
          this.worldRenderer.renderOreChip(this.dom.stratumCoreSwatches, ore.type);
        }
      }

      if (this.dom.stratumBonusSwatches) {
        this.dom.stratumBonusSwatches.replaceChildren();
        for (const ore of [...stratum.bonusFromPrev, ...stratum.bonusFromNext]) {
          this.worldRenderer.renderOreChip(this.dom.stratumBonusSwatches, ore.type);
        }
      }
    }

    if (!this.dom.blockName || !this.dom.blockType || !this.dom.blockHp || !this.dom.blockValue || !this.dom.blockRange || !this.dom.blockYield) {
      return;
    }

    if (!target) {
      this.clearBlockPanel();
      return;
    }

    const tile = this.world.getTile(target.column, target.row);
    if (!tile) {
      this.clearBlockPanel();
      return;
    }

    const blockTypeText = tile.type === TILE_TYPES.CHEST ? "Treasure chest" : (tile.definition.drop ? "Ore" : "Stratum block");
    const blockHpText = tile.maxHp > 0 ? `${Math.ceil(tile.hp)} / ${tile.maxHp}` : "--";
    const blockValueText = tile.definition.drop
      ? `${ITEM_DEFINITIONS[tile.definition.drop]?.value ?? 0}€`
      : (tile.type === TILE_TYPES.CHEST ? "Reward" : "0€");
    const blockRangeText = target.distance ? `${(target.distance / TILE_SIZE).toFixed(1)} tiles` : "In range";
    const dropRange = this.world.getOreDropRange(target.row, tile.type, player?.bonuses);
    const blockYieldText = tile.type === TILE_TYPES.CHEST
      ? "1 card pick"
      : dropRange
        ? this.formatOreDropRange(dropRange)
        : "--";

    const blockSignature = [
      tile.type,
      tile.definition.label,
      blockTypeText,
      blockHpText,
      blockValueText,
      blockRangeText,
      blockYieldText,
    ].join("|");

    if (blockSignature === this.state.blockSignature) {
      return;
    }

    this.state.blockSignature = blockSignature;
    if (this.state.lastBlockIconType !== tile.type) {
      this.worldRenderer.paintIcon(this.dom.blockIcon, tile.type);
      this.state.lastBlockIconType = tile.type;
    }
    this.setTextContentIfChanged(this.dom.blockName, tile.definition.label);
    this.setTextContentIfChanged(this.dom.blockType, blockTypeText);
    this.setTextContentIfChanged(this.dom.blockHp, blockHpText);
    this.setTextContentIfChanged(this.dom.blockValue, blockValueText);
    this.setTextContentIfChanged(this.dom.blockRange, blockRangeText);
    this.setTextContentIfChanged(this.dom.blockYield, blockYieldText);
  }

  clearBlockPanel() {
    if (this.state.blockSignature === "empty") {
      return;
    }

    this.state.blockSignature = "empty";
    if (this.state.lastBlockIconType !== TILE_TYPES.EMPTY) {
      this.worldRenderer.paintIcon(this.dom.blockIcon, TILE_TYPES.EMPTY);
      this.state.lastBlockIconType = TILE_TYPES.EMPTY;
    }
    this.setTextContentIfChanged(this.dom.blockName, "None");
    this.setTextContentIfChanged(this.dom.blockType, "No target");
    this.setTextContentIfChanged(this.dom.blockHp, "--");
    this.setTextContentIfChanged(this.dom.blockValue, "--");
    this.setTextContentIfChanged(this.dom.blockRange, "--");
    this.setTextContentIfChanged(this.dom.blockYield, "--");
  }

  formatOreDropRange(dropRange) {
    const normalRange = dropRange.normalMin === dropRange.normalMax
      ? `${dropRange.normalMin}`
      : `${dropRange.normalMin}-${dropRange.normalMax}`;

    if (!dropRange.bonusMax) {
      return normalRange;
    }

    return `${normalRange} (+${dropRange.bonusMax})`;
  }
}

class RendererUiHotbarElement extends RendererUiSection {
  drawHotbar(inventory) {
    const slots = inventory.getSlots();
    const layout = this.getHotbarLayout(inventory);
    const iconPadding = 5;
    const iconSize = layout.slotSize - iconPadding * 2;

    for (let index = 0; index < slots.length; index += 1) {
      const column = index % 8;
      const row = Math.floor(index / 8);
      const x = layout.startX + column * (layout.slotSize + layout.gap);
      const y = layout.startY + row * (layout.slotSize + layout.gap);
      const slot = slots[index];
      this.ctx.fillStyle = "rgba(9, 16, 28, 0.82)";
      this.ctx.fillRect(x, y, layout.slotSize, layout.slotSize);
      this.ctx.strokeStyle = slot ? "rgba(242, 237, 227, 0.45)" : "rgba(136, 185, 216, 0.22)";
      this.ctx.lineWidth = 2;
      this.ctx.strokeRect(x, y, layout.slotSize, layout.slotSize);

      if (!slot) {
        continue;
      }

      this.worldRenderer.drawHotbarItemIcon(x + iconPadding, y + iconPadding, iconSize, slot.itemId);
      this.ctx.font = "bold 13px 'Segoe UI'";
      this.ctx.fillStyle = "#f2ede3";
      this.ctx.fillText(String(slot.count), x + layout.slotSize - 15, y + layout.slotSize - 11);
    }
  }

  getHotbarLayout(inventory) {
    const slots = inventory.getSlots();
    const slotsPerRow = 8;
    const slotSize = 52;
    const gap = 8;
    const rowCount = Math.max(1, Math.ceil(slots.length / slotsPerRow));
    const columns = Math.min(slots.length, slotsPerRow);
    const totalWidth = columns * slotSize + Math.max(0, columns - 1) * gap;
    const startX = (this.viewport.width - totalWidth) * 0.5;
    const startY = this.viewport.height - rowCount * slotSize - Math.max(0, rowCount - 1) * gap - 24;
    return { slotSize, gap, totalWidth, startX, startY };
  }
}

class RendererUiToolCooldownIndicatorsElement extends RendererUiSection {
  constructor(uiRenderer, hotbarElement) {
    super(uiRenderer);
    this.hotbarElement = hotbarElement;
  }

  drawToolCooldownIndicators(roundInfo) {
    const { startX, startY, totalWidth, slotSize } = this.hotbarElement.getHotbarLayout({ getSlots: () => Array(8).fill(null) });
    const centerY = startY + slotSize * 0.5;

    const platformDial = {
      progress: roundInfo.platformCooldown ?? 0,
      charges: roundInfo.platformCharges ?? 0,
      capacity: roundInfo.platformCapacity ?? 1,
      accent: "rgba(241, 208, 77, 0.8)",
      mutedAccent: "rgba(136, 185, 216, 0.5)",
      plateStroke: "rgba(215, 176, 123, 0.52)",
      actions: [{ label: "Q" }],
      drawIcon: () => this.drawPlatformClockIcon(),
    };
    const bombDial = {
      progress: roundInfo.bombCooldown ?? 0,
      charges: roundInfo.bombCharges ?? 0,
      capacity: roundInfo.bombCapacity ?? 0,
      accent: "rgba(255, 146, 96, 0.88)",
      mutedAccent: "rgba(226, 182, 120, 0.48)",
      plateStroke: "rgba(255, 146, 96, 0.52)",
      actions: [{ label: "E" }],
      drawIcon: () => this.drawBombRackIcon(roundInfo.bombVisual ?? {}),
    };
    const primaryTool = roundInfo.primaryTool === "bomb" ? "bomb" : "platform";
    const leftDial = primaryTool === "bomb"
      ? { ...bombDial, actions: [{ label: "Q" }, { icon: "mouse" }] }
      : { ...platformDial, actions: [{ label: "Q" }, { icon: "mouse" }] };
    const rightDial = primaryTool === "bomb"
      ? { ...platformDial, actions: [{ label: "E" }] }
      : { ...bombDial, actions: [{ label: "E" }] };

    this.drawCooldownDial({
      centerX: startX - 42,
      centerY,
      ...leftDial,
    });
    this.drawCooldownDial({
      centerX: startX + totalWidth + 42,
      centerY,
      ...rightDial,
    });
  }

  drawCooldownDial({ centerX, centerY, progress, charges, capacity, accent, mutedAccent, plateStroke, actions = [], drawIcon }) {
    const radius = 26;
    const disabled = capacity <= 0;
    const remainingArc = Math.max(0, Math.min(1, progress));
    const ready = !disabled && charges > 0;
    const dialFill = disabled ? "rgba(18, 23, 32, 0.88)" : "rgba(10, 16, 28, 0.9)";
    const dialStroke = disabled ? "rgba(108, 118, 132, 0.4)" : (ready ? accent : mutedAccent);
    const arcFill = disabled ? "rgba(82, 90, 102, 0.3)" : "rgba(120, 132, 148, 0.4)";
    const badgeStroke = disabled ? "rgba(108, 118, 132, 0.35)" : plateStroke;

    this.ctx.save();
    this.ctx.translate(centerX, centerY);
    this.ctx.fillStyle = dialFill;
    this.ctx.beginPath();
    this.ctx.arc(0, 0, radius, 0, Math.PI * 2);
    this.ctx.fill();
    this.ctx.strokeStyle = dialStroke;
    this.ctx.lineWidth = 2.5;
    this.ctx.stroke();

    if (remainingArc > 0) {
      this.ctx.beginPath();
      this.ctx.moveTo(0, 0);
      this.ctx.fillStyle = arcFill;
      this.ctx.arc(-0.0001, -0.0001, radius - 2, -Math.PI * 0.5, -Math.PI * 0.5 - Math.PI * 2 * remainingArc, true);
      this.ctx.closePath();
      this.ctx.fill();
    }

    if (disabled) {
      this.ctx.save();
      this.ctx.globalAlpha = 0.4;
      drawIcon();
      this.ctx.restore();
    } else {
      drawIcon();
    }

    actions.forEach((action, index) => {
      const angle = index === 0 ? -Math.PI * 0.75 : -Math.PI * 0.25;
      const badgeX = Math.cos(angle) * radius;
      const badgeY = Math.sin(angle) * radius;
      this.drawDialBadge({ x: badgeX, y: badgeY, radius: 10, stroke: badgeStroke, action, disabled });
    });

    this.drawCounterPlate({
      x: 0,
      y: radius + 1,
      width: 32,
      height: 18,
      stroke: badgeStroke,
      valueText: `${charges}/${capacity}`,
      disabled,
    });
    this.ctx.restore();
  }

  drawDialBadge({ x, y, radius, stroke, action = null, valueText = null, disabled = false }) {
    this.ctx.save();
    this.ctx.translate(x, y);
    this.ctx.fillStyle = disabled ? "rgba(22, 27, 36, 0.92)" : "rgba(16, 23, 36, 0.94)";
    this.ctx.beginPath();
    this.ctx.arc(0, 0, radius, 0, Math.PI * 2);
    this.ctx.fill();
    this.ctx.strokeStyle = stroke;
    this.ctx.lineWidth = 1.4;
    this.ctx.stroke();

    if (valueText !== null) {
      this.ctx.fillStyle = disabled ? "rgba(188, 192, 198, 0.75)" : "#f2ede3";
      this.ctx.textAlign = "center";
      this.ctx.textBaseline = "middle";
      this.ctx.font = "800 9px 'Segoe UI'";
      this.ctx.fillText(valueText, 0, 0);
      this.ctx.restore();
      return;
    }

    if (action?.icon === "mouse") {
      if (disabled) {
        this.ctx.globalAlpha = 0.45;
      }
      this.drawMouseActionIcon();
      this.ctx.restore();
      return;
    }

    this.ctx.fillStyle = disabled ? "rgba(188, 192, 198, 0.75)" : "#f2ede3";
    this.ctx.textAlign = "center";
    this.ctx.textBaseline = "middle";
    this.ctx.font = "500 11px 'Segoe UI'";
    this.ctx.fillText(action?.label ?? "", 0, 0);
    this.ctx.restore();
  }

  drawCounterPlate({ x, y, width, height, stroke, valueText, disabled = false }) {
    this.ctx.save();
    this.ctx.translate(x, y);
    this.drawRoundedPlate(
      -width * 0.5,
      -height * 0.5,
      width,
      height,
      8,
      disabled ? "rgba(22, 27, 36, 0.92)" : "rgba(16, 23, 36, 0.94)",
      stroke,
    );
    this.ctx.fillStyle = disabled ? "rgba(188, 192, 198, 0.75)" : "#f2ede3";
    this.ctx.textAlign = "center";
    this.ctx.textBaseline = "middle";
    this.ctx.font = "500 11px 'Segoe UI'";
    this.ctx.fillText(valueText, 0, 0);
    this.ctx.restore();
  }

  drawMouseActionIcon() {
    this.ctx.save();
    this.ctx.translate(-4.5, -6.5);
    this.ctx.strokeStyle = "rgba(242, 237, 227, 0.94)";
    this.ctx.lineWidth = 1.25;
    this.ctx.beginPath();
    this.ctx.roundRect(0, 0, 9, 13, 4);
    this.ctx.stroke();
    this.ctx.fillStyle = "rgba(242, 237, 227, 0.9)";
    this.ctx.fillRect(4.75, 1.1, 2.4, 4.2);
    this.ctx.fillStyle = "rgba(16, 23, 36, 0.94)";
    this.ctx.fillRect(4.1, 1.1, 0.8, 4.2);
    this.ctx.restore();
  }

  drawRoundedPlate(x, y, width, height, radius, fill, stroke) {
    this.ctx.fillStyle = fill;
    this.drawRoundedRectPath(x, y, width, height, radius);
    this.ctx.fill();
    this.ctx.strokeStyle = stroke;
    this.ctx.lineWidth = 1.4;
    this.ctx.stroke();
  }

  drawRoundedRectPath(x, y, width, height, radius) {
    const rounded = Math.min(radius, width * 0.5, height * 0.5);
    this.ctx.beginPath();
    this.ctx.moveTo(x + rounded, y);
    this.ctx.arcTo(x + width, y, x + width, y + height, rounded);
    this.ctx.arcTo(x + width, y + height, x, y + height, rounded);
    this.ctx.arcTo(x, y + height, x, y, rounded);
    this.ctx.arcTo(x, y, x + width, y, rounded);
    this.ctx.closePath();
  }

  drawPlatformClockIcon() {
    this.ctx.fillStyle = "#d7b07b";
    this.ctx.fillRect(-12, 2, 24, 6);
    this.ctx.fillRect(-10, -1, 20, 3);
    this.ctx.fillStyle = "#4f3720";
    this.ctx.fillRect(-9, 8, 3, 5);
    this.ctx.fillRect(-1, 8, 3, 5);
    this.ctx.fillRect(7, 8, 3, 5);
    this.ctx.fillStyle = "rgba(255, 246, 208, 0.75)";
    this.ctx.fillRect(-10, 0, 20, 1);
  }

  drawBombRackIcon(bombVisual = {}) {
    const spriteRow = bombVisual.spriteRow ?? 0;
    if (bombVisual.sheet === "sheep" && this.assets?.sheepSpritesheet) {
      const frameWidth = Math.max(1, Math.floor(this.assets.sheepSpritesheet.width / 7));
      const frameHeight = Math.max(1, Math.floor(this.assets.sheepSpritesheet.height / 5));
      this.ctx.drawImage(
        this.assets.sheepSpritesheet,
        (bombVisual.iconFrame ?? 0) * frameWidth,
        (bombVisual.iconRow ?? 0) * frameHeight,
        frameWidth,
        frameHeight,
        -12,
        -14,
        24,
        24,
      );
      return;
    }

    if (this.assets?.bombSpritesheet) {
      this.ctx.drawImage(this.assets.bombSpritesheet, 0, spriteRow * 32, 32, 32, -12, -14, 24, 24);
      return;
    }

    if (spriteRow === 0) {
      this.ctx.fillStyle = "#b53d34";
      this.ctx.fillRect(-8, -5, 16, 6);
      this.ctx.fillStyle = "#d3a46f";
      this.ctx.fillRect(5, -10, 3, 6);
      return;
    }

    if (spriteRow === 1) {
      this.ctx.fillStyle = "#b53d34";
      this.ctx.fillRect(-10, -6, 20, 8);
      this.ctx.fillStyle = "#e7c188";
      this.ctx.fillRect(6, -11, 3, 6);
      return;
    }

    if (spriteRow === 3) {
      this.ctx.fillStyle = "#587240";
      this.ctx.beginPath();
      this.ctx.ellipse(0, -1, 10, 9, 0, 0, Math.PI * 2);
      this.ctx.fill();
      this.ctx.fillStyle = "#e7cd48";
      this.ctx.beginPath();
      this.ctx.arc(0, -1, 4, 0, Math.PI * 2);
      this.ctx.fill();
      this.ctx.fillStyle = "#6f552f";
      this.ctx.fillRect(-2, -12, 4, 5);
      return;
    }

    this.ctx.fillStyle = "#1f1a21";
    this.ctx.beginPath();
    this.ctx.arc(0, -2, 9, 0, Math.PI * 2);
    this.ctx.fill();
    this.ctx.fillStyle = "#b78356";
    this.ctx.fillRect(4, -13, 3, 7);
  }
}

class RendererUiHotbarSection extends RendererUiSection {
  constructor(uiRenderer) {
    super(uiRenderer);
    this.hotbarElement = new RendererUiHotbarElement(uiRenderer);
    this.toolCooldownIndicatorsElement = new RendererUiToolCooldownIndicatorsElement(uiRenderer, this.hotbarElement);
  }

  drawHotbar(inventory) {
    this.hotbarElement.drawHotbar(inventory);
  }

  getHotbarLayout(inventory) {
    return this.hotbarElement.getHotbarLayout(inventory);
  }

  drawToolCooldownIndicators(roundInfo) {
    this.toolCooldownIndicatorsElement.drawToolCooldownIndicators(roundInfo);
  }
}

export class RendererUiSubsystem extends RendererSubsystem {
  constructor(renderer, worldRenderer) {
    super(renderer);
    this.worldRenderer = worldRenderer;
    this.state = {
      bonusStatsSignature: "",
      hudSignature: "",
      stratumSignature: "",
      blockSignature: "",
      lastStratumIconType: null,
      lastBlockIconType: null,
      lastFrameTimestamp: 0,
      fpsSampleElapsed: 0,
      fpsSampleFrames: 0,
      displayedFps: 0,
    };
    this.dom = {
      roundTimer: document.getElementById("round-timer"),
      roundTimerValue: document.getElementById("round-timer-value"),
      bankValue: document.getElementById("bank-value"),
      bonusStats: document.getElementById("bonus-stats"),
      roundValue: document.getElementById("round-value"),
      roundToast: document.getElementById("round-toast"),
      stratumIcon: document.getElementById("stratum-icon"),
      stratumName: document.getElementById("stratum-name"),
      stratumDepth: document.getElementById("stratum-depth"),
      stratumCoreSwatches: document.getElementById("stratum-core-swatches"),
      stratumBonusSwatches: document.getElementById("stratum-bonus-swatches"),
      blockIcon: document.getElementById("block-icon"),
      blockName: document.getElementById("block-name"),
      blockType: document.getElementById("block-type"),
      blockHp: document.getElementById("block-hp"),
      blockValue: document.getElementById("block-value"),
      blockRange: document.getElementById("block-range"),
      blockYield: document.getElementById("block-yield"),
    };
    this.performanceSection = new RendererUiPerformanceSection(this);
    this.hudSection = new RendererUiHudSection(this);
    this.surveySection = new RendererUiSurveySection(this);
    this.hotbarSection = new RendererUiHotbarSection(this);
  }

  updateFrameRateCounter() {
    this.performanceSection.updateFrameRateCounter();
  }

  drawPerformanceCounters(roundInfo = {}) {
    this.performanceSection.drawPerformanceCounters(roundInfo);
  }

  drawHud(inventory, roundInfo) {
    this.hudSection.drawHud(roundInfo);
    this.hotbarSection.drawToolCooldownIndicators(roundInfo);
  }

  drawSurveyPanel(player, target) {
    this.surveySection.drawSurveyPanel(player, target);
  }

  drawHotbar(inventory) {
    this.hotbarSection.drawHotbar(inventory);
  }
}
