import BN from 'bn.js';
import { Order } from './order';
import { OrderSelection } from './order-selection';

function findMinVolumeIdx(orders: Order[]): number {
  let lowest = orders[0].remainingVolume;
  let lowestIdx = 0;
  for (let i = 1; i < orders.length; i++) {
    const remaining = orders[i].remainingVolume;
    if (lowest.gt(remaining)) {
      lowest = remaining;
      lowestIdx = i;
    }
  }
  return lowestIdx;
}

function applyOrder(order: Order, requiredVolume: BN) {
  const volume = order.remainingVolume;
  const volumeEth = order.remainingVolumeEth;

  if (requiredVolume.gte(volume)) {
    return {
      volume,
      volumeEth,
      extraVolume: new BN(0),
      extraVolumeEth: new BN(0),
    };
  } else {
    const propotionalVolumeEth = volumeEth.mul(requiredVolume).div(volume);
    return {
      volume: requiredVolume,
      volumeEth: propotionalVolumeEth,
      extraVolume: volume.sub(requiredVolume),
      extraVolumeEth: volumeEth.sub(propotionalVolumeEth),
    };
  }
}

export function selectOrdersFor(
  orders: Order[],
  ordersQty: number,
  totalVolume: BN
): OrderSelection {
  if (orders.length === 0) {
    return {
      baseVolume: new BN(0),
      baseVolumeEth: new BN(0),
      extraVolume: new BN(0),
      extraVolumeEth: new BN(0),
      orders: [],
    };
  }

  let accVolume = new BN(0);
  let accVolumeEth = new BN(0);
  let selectedOrders: Order[] = [];
  let makers = {};

  for (const order of orders) {
    if (!makers[order.maker]) {
      //Save the maker
      makers[order.maker] = true;

      // if next order will surpass qty, we first remove an order.
      if (selectedOrders.length >= ordersQty) {
        const idxToRemove = findMinVolumeIdx(selectedOrders);
        const [deletedOrder] = selectedOrders.splice(idxToRemove, 1);
        accVolume = accVolume.sub(deletedOrder.remainingVolume);
        accVolumeEth = accVolumeEth.sub(deletedOrder.remainingVolumeEth);
        makers[deletedOrder.maker] = false;
      }

      // We compute volume amounts to complete the remaining volume
      // The computed volume can be the full order or just a part of it
      const remainingVolume = totalVolume.sub(accVolume);
      const { volume, volumeEth, extraVolume, extraVolumeEth } = applyOrder(order, remainingVolume);

      // We add the order the volume to use from it, to the set.
      selectedOrders.push(order);
      accVolume = accVolume.add(volume);
      accVolumeEth = accVolumeEth.add(volumeEth);

      // If we already achieve the required volume, exit
      if (accVolume.gte(totalVolume)) {
        return {
          baseVolume: accVolume,
          baseVolumeEth: accVolumeEth,
          extraVolume,
          extraVolumeEth,
          orders: selectedOrders,
        };
      }
    }
  }
  throw new Error("can't operate to that amount");
}

/**
 * Returns the minimun Volume using the orders so that
 * we have volumeEth as passed.
 *
 * @param orders
 * @param minVolumeEth
 * @returns minVolume in tokenDecimals
 */
export function getMinVolume(orders: Order[], minVolumeEth: BN): BN {
  // how muchs token should I buy to spend MIN_ETH_AMOUNT ?
  // tokens at best price. (in td)
  if (orders.length === 0) {
    return new BN(0);
  } else {
    const order = orders[0];
    const BIGN = new BN('100000000000000000000');

    const minVolume = minVolumeEth
      .mul(order.remainingVolume)
      .mul(BIGN)
      .div(order.remainingVolumeEth)
      .div(BIGN);

    return minVolume;
  }
}

export function getMaxVolume(orders: Order[], maxOrders: number): BN {
  let makers = {};
  const maxVolume = orders
    .filter(o => {
      const result = !makers[o.maker];
      makers[o.maker] = true;
      return result;
    })
    .map(o => o.remainingVolume)
    .sort((v1, v2) => v2.cmp(v1))
    .slice(0, maxOrders)
    .reduce((acc, v) => v.add(acc), new BN(0));

  return maxVolume;
}

// For Testing
export { findMinVolumeIdx as _findMinVolumeIdx };
