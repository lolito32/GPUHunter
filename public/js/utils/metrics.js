'use strict';
import { money } from './format.js';

const FPS_MAP = {
  'gtx-1050-ti': 35,
  'gtx-1060': 50,
  'gtx-1650': 45,
  'gtx-1650-super': 55,
  'gtx-1660': 65,
  'gtx-1660-super': 75,
  'gtx-1660-ti': 80,
  'rtx-2060': 85,
  'rtx-2060-super': 95,
  'rtx-2070': 105,
  'rtx-2070-super': 115,
  'rtx-2080': 120,
  'rtx-2080-super': 130,
  'rtx-2080-ti': 145,
  'rtx-3050': 65,
  'rtx-3060': 85,
  'rtx-3060-ti': 115,
  'rtx-3070': 140,
  'rtx-3070-ti': 155,
  'rtx-3080': 180,
  'rtx-3080-ti': 195,
  'rtx-3090': 200,
  'rtx-3090-ti': 210,
  'rtx-4060': 105,
  'rtx-4060-ti': 130,
  'rtx-4070': 175,
  'rtx-4070-super': 195,
  'rtx-4070-ti': 210,
  'rtx-4080': 245,
  'rtx-4080-super': 255,
  'rtx-4090': 310,
  'rtx-5050': 80,
  'rtx-5060': 120,
  'rtx-5060-ti': 150,
  'rtx-5070': 200,
  'rtx-5070-ti': 230,
  'rtx-5080': 280,
  'rtx-5090': 350,
  'rx-570': 50,
  'rx-580': 60,
  'rx-590': 70,
  'rx-5500-xt': 55,
  'rx-5600-xt': 80,
  'rx-5700': 100,
  'rx-5700-xt': 115,
  'rx-6400': 35,
  'rx-6500-xt': 45,
  'rx-6600': 75,
  'rx-6600-xt': 95,
  'rx-6650-xt': 100,
  'rx-6700': 110,
  'rx-6700-xt': 125,
  'rx-6750-xt': 135,
  'rx-6800': 160,
  'rx-6800-xt': 180,
  'rx-6900-xt': 195,
  'rx-6950-xt': 205,
  'rx-7600': 105,
  'rx-7600-xt': 115,
  'rx-7700-xt': 150,
  'rx-7800-xt': 185,
  'rx-7900-xt': 230,
  'rx-7900-xtx': 260,
  'arc-a380': 40,
  'arc-a580': 70,
  'arc-a750': 95,
  'arc-a770': 105,
  'arc-b570': 110,
  'arc-b580': 130
};

export function getGpuFps(gpuKey) {
  if (!gpuKey) return 70;
  return FPS_MAP[gpuKey] || 70;
}

export function calculateCostPerFps(gpuKey, price) {
  if (!price || price <= 0) return null;
  const fps = getGpuFps(gpuKey);
  const ratio = Math.round(price / fps);
  return ratio;
}

export function formatCostPerFps(gpuKey, price) {
  const ratio = calculateCostPerFps(gpuKey, price);
  if (ratio === null) return '';
  return money(ratio) + ' / FPS';
}
