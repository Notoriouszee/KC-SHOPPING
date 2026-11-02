import { Badge } from "./ui";
import {
  ORDER_STATUS_LABELS,
  ORDER_STATUS_TONES,
  ORDER_SOURCE_LABELS,
  PAYMENT_STATUS_LABELS,
  PAYMENT_STATUS_TONES,
  type OrderSource,
  type OrderStatus,
  type PaymentStatus,
} from "../lib/domain/status";

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  return <Badge tone={ORDER_STATUS_TONES[status]}>{ORDER_STATUS_LABELS[status]}</Badge>;
}

export function PaymentBadge({ status }: { status: PaymentStatus }) {
  return <Badge tone={PAYMENT_STATUS_TONES[status]}>{PAYMENT_STATUS_LABELS[status]}</Badge>;
}

export function SourceBadge({ source }: { source: OrderSource }) {
  return <Badge tone="neutral">{ORDER_SOURCE_LABELS[source]}</Badge>;
}
