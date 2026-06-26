/**
 * Service layer barrel.
 *
 * Services are re-exported as namespaces because several share function names
 * (e.g. multiple `list*`/`get*`). Import them as:
 *
 *   import { orderService, kdsService } from '@/lib/services';
 *   const result = await orderService.listActiveOrders(client, restaurantId);
 *
 * The financials service is exported, but note that the KDS service never
 * imports it — the revenue firewall is preserved at the module boundary.
 */

export * as restaurantService from './restaurant.service';
export * as menuService from './menu.service';
export * as orderService from './order.service';
export * as kdsService from './kds.service';
export * as financialsService from './financials.service';
export * as customerService from './customer.service';
export * as loyaltyService from './loyalty.service';
export * as couponService from './coupon.service';
export * as reviewService from './review.service';
export * as reportsService from './reports.service';
export * as staffService from './staff.service';

export type {
  Client,
  ServiceResult,
  ServiceError,
} from './_shared';
