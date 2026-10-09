'use strict';
import { money } from './format.js';

const FPS_MAP = {
  // NVIDIA - GTX Series
  'gtx-1050-ti': 25,
  'gtx-1060-3gb': 32,
  'gtx-1060-6gb': 38,
  'gtx-1650': 40,
  'gtx-1650-super': 53,
  'gtx-1660': 58,
  'gtx-1660-super': 68,
  'gtx-1660-ti': 70,

  // NVIDIA - RTX 20 Series
  'rtx-2060-6gb': 78,
  'rtx-2060-12gb': 80,
  'rtx-2060-super': 90,
  'rtx-2070': 94,
  'rtx-2070-super': 105,
  'rtx-2080': 110,
  'rtx-2080-super': 118,
  'rtx-2080-ti': 138,

  // NVIDIA - RTX 30 Series
  'rtx-3050-6gb': 50,
  'rtx-3050-8gb': 63,
  'rtx-3060-8gb': 75,
  'rtx-3060-12gb': 88,
  'rtx-3060-ti': 115,
  'rtx-3070': 130,
  'rtx-3070-ti': 140,
  'rtx-3080-10gb': 165,
  'rtx-3080-12gb': 172,
  'rtx-3080-ti': 180,
  'rtx-3090': 190,
  'rtx-3090-ti': 205,

  // NVIDIA - RTX 40 Series
  'rtx-4060': 108,
  'rtx-4060-ti-8gb': 130,
  'rtx-4060-ti-16gb': 132,
  'rtx-4070': 170,
  'rtx-4070-super': 195,
  'rtx-4070-ti': 205,
  'rtx-4070-ti-super': 225,
  'rtx-4080': 240,
  'rtx-4080-super': 250,
  'rtx-4090': 310,

  // NVIDIA - RTX 50 Series
  'rtx-5050': 85,
  'rtx-5060': 125,
  'rtx-5070': 215,
  'rtx-5070-ti': 245,
  'rtx-5080': 295,
  'rtx-5090': 380,

  // AMD - RX 500 & 5000 Series
  'rx-570-4gb': 35,
  'rx-570-8gb': 40,
  'rx-580-4gb': 40,
  'rx-580-8gb': 45,
  'rx-590': 52,
  'rx-5500-xt-4gb': 48,
  'rx-5500-xt-8gb': 55,
  'rx-5600-xt': 78,
  'rx-5700': 88,
  'rx-5700-xt': 98,

  // AMD - RX 6000 Series
  'rx-6400': 38,
  'rx-6500-xt-4gb': 48,
  'rx-6500-xt-8gb': 52,
  'rx-6600': 85,
  'rx-6600-xt': 100,
  'rx-6650-xt': 105,
  'rx-6700': 115,
  'rx-6700-xt': 130,
  'rx-6750-xt': 138,
  'rx-6800': 160,
  'rx-6800-xt': 185,
  'rx-6900-xt': 200,
  'rx-6950-xt': 215,

  // AMD - RX 7000 Series
  'rx-7600': 106,
  'rx-7600-xt': 112,
  'rx-7700-xt': 155,
  'rx-7800-xt': 180,
  'rx-7900-gre': 195,
  'rx-7900-xt': 220,
  'rx-7900-xtx': 260,

  // INTEL - Arc
  'arc-a380': 35,
  'arc-a580': 72,
  'arc-a750': 85,
  'arc-a770-8gb': 90,
  'arc-a770-16gb': 95,
  'arc-b570': 100, 
  'arc-b580': 118 
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
