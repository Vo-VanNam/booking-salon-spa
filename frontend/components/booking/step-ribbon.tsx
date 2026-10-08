'use client';

import { motion } from 'framer-motion';
import { Clock, MapPin, User } from 'lucide-react';
import { formatDateTime, formatVnd } from '@/lib/format';

/**
 * Signature element của sản phẩm: dải ribbon bám theo lựa chọn của khách
 * (chi nhánh · dịch vụ + thời lượng/giá · stylist · giờ hẹn) để khách luôn biết mình đang đặt gì.
 */
export function StepRibbon({
  branchName,
  serviceName,
  durationMinutes,
  price,
  stylistName,
  startTime,
}: {
  branchName?: string;
  serviceName?: string;
  durationMinutes?: number;
  price?: number;
  stylistName?: string;
  startTime?: string;
}) {
  const hasContent = Boolean(branchName || serviceName || stylistName || startTime);
  if (!hasContent) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: [0.2, 0, 0, 1] }}
      className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-card border border-[#DCCDB8] bg-accent-soft px-3 py-2 text-body-sm text-accent"
      aria-live="polite"
    >
      {branchName ? (
        <span className="flex items-center gap-1">
          <MapPin size={14} aria-hidden /> {branchName}
        </span>
      ) : null}
      {serviceName ? (
        <span className="flex items-center gap-1 font-medium">
          {serviceName}
          {durationMinutes ? (
            <>
              <Clock size={14} aria-hidden /> {durationMinutes} phút
            </>
          ) : null}
          {price ? <span className="tnum">· {formatVnd(price)}</span> : null}
        </span>
      ) : null}
      {stylistName ? (
        <span className="flex items-center gap-1">
          <User size={14} aria-hidden /> {stylistName}
        </span>
      ) : null}
      {startTime ? <span className="tnum font-medium">· {formatDateTime(startTime)}</span> : null}
    </motion.div>
  );
}
