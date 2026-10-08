'use client';

import * as React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { CalendarDays, CheckCircle2, Clock, MapPin, Scissors, User } from 'lucide-react';
import { bookingApi, catalogApi, ApiError } from '@/lib/api';
import { formatDate, formatDateTime, formatTime, formatVnd, relativeDayLabel, vnDateKey } from '@/lib/format';
import type { Booking, Branch, Service, Slot, Stylist } from '@/lib/types';
import { emailError, nameError, phoneError } from '@/lib/validators';
import { Alert } from '@/components/ui/alert';
import { Badge, Card, EmptyState, Skeleton } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input, Label, Textarea } from '@/components/ui/input';
import { StepRibbon } from './step-ribbon';

type Step = 'branch' | 'service' | 'stylist' | 'time' | 'details' | 'done';

const STEP_ORDER: Step[] = ['branch', 'service', 'stylist', 'time', 'details'];
const STEP_TITLE: Record<Step, string> = {
  branch: 'Chọn chi nhánh',
  service: 'Chọn dịch vụ',
  stylist: 'Chọn stylist',
  time: 'Chọn khung giờ',
  details: 'Thông tin của bạn',
  done: 'Đã đặt lịch',
};

export function BookingWizard() {
  const [step, setStep] = React.useState<Step>('branch');
  const [branches, setBranches] = React.useState<Branch[]>([]);
  const [services, setServices] = React.useState<Service[]>([]);
  const [stylists, setStylists] = React.useState<Stylist[]>([]);
  const [slots, setSlots] = React.useState<Slot[]>([]);
  const [branch, setBranch] = React.useState<Branch | null>(null);
  const [service, setService] = React.useState<Service | null>(null);
  const [stylist, setStylist] = React.useState<Stylist | null>(null);
  const [date, setDate] = React.useState<string>(vnDateKey(1));
  const [slot, setSlot] = React.useState<Slot | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [suggestions, setSuggestions] = React.useState<string[]>([]);
  const [booking, setBooking] = React.useState<Booking | null>(null);
  const [form, setForm] = React.useState({ name: '', phone: '', email: '', note: '' });
  const [fieldErrors, setFieldErrors] = React.useState<{ name?: string; phone?: string; email?: string }>({});
  const [paymentNotice, setPaymentNotice] = React.useState<string | null>(null);

  React.useEffect(() => {
    setLoading(true);
    catalogApi
      .branches()
      .then(setBranches)
      .catch((err: ApiError) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  // Mỗi khi đổi chi nhánh/dịch vụ/stylist/ngày → tải lại dữ liệu liên quan.
  React.useEffect(() => {
    if (!branch) return;
    setLoading(true);
    catalogApi
      .services(branch.id)
      .then(setServices)
      .catch((err: ApiError) => setError(err.message))
      .finally(() => setLoading(false));
  }, [branch]);

  React.useEffect(() => {
    if (!branch) return;
    catalogApi
      .stylists(branch.id)
      .then(setStylists)
      .catch((err: ApiError) => setError(err.message));
  }, [branch]);

  React.useEffect(() => {
    if (!branch || !service || !stylist) return;
    setLoading(true);
    setError(null);
    catalogApi
      .slots({ branchId: branch.id, stylistId: stylist.id, serviceId: service.id, date })
      .then((result) => {
        setSlots(result);
        setSlot((current) => (current && result.some((item) => item.start_time === current.start_time) ? current : null));
      })
      .catch((err: ApiError) => setError(err.message))
      .finally(() => setLoading(false));
  }, [branch, service, stylist, date]);

  const goTo = (next: Step) => {
    setError(null);
    setStep(next);
  };

  const restart = () => {
    setStep('branch');
    setBooking(null);
    setSlot(null);
    setService(null);
    setStylist(null);
    setForm({ name: '', phone: '', email: '', note: '' });
    setSuggestions([]);
    setPaymentNotice(null);
  };

  async function submit() {
    const errors = {
      name: nameError(form.name) ?? undefined,
      phone: phoneError(form.phone) ?? undefined,
      email: emailError(form.email) ?? undefined,
    };
    setFieldErrors(errors);
    if (errors.name || errors.phone || errors.email) return;
    if (!branch || !service || !stylist || !slot) {
      setError('Vui lòng chọn đủ chi nhánh, dịch vụ, stylist và khung giờ.');
      return;
    }

    setLoading(true);
    setError(null);
    setSuggestions([]);
    try {
      const created = await bookingApi.create({
        branch_id: branch.id,
        service_id: service.id,
        stylist_id: stylist.id,
        start_time: slot.start_time,
        customer_name: form.name.trim(),
        customer_phone: form.phone.trim(),
        customer_email: form.email.trim() || undefined,
        note: form.note.trim() || undefined,
        source: 'web',
      });
      setBooking(created);
      setStep('done');
    } catch (err) {
      const apiError = err as ApiError;
      setError(apiError.message);
      const payload = apiError.payload as { suggestions?: string[] } | undefined;
      setSuggestions(Array.isArray(payload?.suggestions) ? payload.suggestions.slice(0, 3) : []);
    } finally {
      setLoading(false);
    }
  }

  async function payDeposit() {
    if (!booking) return;
    setPaymentNotice(null);
    setError(null);
    try {
      const result = await bookingApi.deposit(booking.id, 'vnpay');
      window.location.href = result.payment_url;
    } catch (err) {
      setPaymentNotice((err as ApiError).message);
    }
  }

  const stepIndex = STEP_ORDER.indexOf(step);

  return (
    <div className="mx-auto w-full max-w-xl px-4 pb-16 pt-6">
      <header className="mb-4">
        <p className="text-meta uppercase tracking-wide text-muted">Chuỗi salon &amp; spa</p>
        <h1 className="text-title font-semibold text-ink">Đặt lịch hẹn</h1>
        <p className="mt-1 text-body-sm text-muted">
          Chọn chi nhánh, dịch vụ, stylist và khung giờ trống — xác nhận trong chưa đầy 2 phút.
        </p>
      </header>

      {step !== 'done' ? (
        <StepRibbon
          branchName={branch?.name}
          serviceName={service?.name}
          durationMinutes={service?.duration_minutes}
          price={service?.price}
          stylistName={stylist?.name}
          startTime={slot?.start_time}
        />
      ) : null}

      <div className="mt-3 flex items-center gap-2" aria-label="Tiến trình đặt lịch">
        {STEP_ORDER.map((item, index) => (
          <span
            key={item}
            className={`h-1.5 flex-1 rounded-full transition-colors duration-base ${
              index <= stepIndex && step !== 'done' ? 'bg-accent' : 'bg-surface-3'
            }`}
          />
        ))}
      </div>

      {error ? (
        <Alert
          tone="danger"
          title={error}
          className="mt-3"
          action={
            suggestions.length > 0 ? (
              <div className="flex flex-col gap-1">
                {suggestions.map((item) => (
                  <Button
                    key={item}
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      const found = slots.find((candidate) => candidate.start_time === item);
                      if (found) {
                        setSlot(found);
                      } else {
                        setDate(item.slice(0, 10));
                      }
                      setError(null);
                      setSuggestions([]);
                    }}
                  >
                    Chọn {formatDateTime(item)}
                  </Button>
                ))}
              </div>
            ) : null
          }
        />
      ) : null}

      <AnimatePresence mode="wait" initial={false}>
        <motion.section
          key={step}
          initial={{ opacity: 0, x: 24 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -24 }}
          transition={{ duration: 0.32, ease: [0.2, 0, 0, 1] }}
          className="mt-4"
          aria-live="polite"
        >
          <h2 className="mb-3 text-section font-semibold text-ink">{STEP_TITLE[step]}</h2>

          {step === 'branch' ? (
            <div className="flex flex-col gap-2">
              {loading && branches.length === 0 ? <Skeleton className="h-16" /> : null}
              {branches.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setBranch(item);
                    setService(null);
                    setStylist(null);
                    goTo('service');
                  }}
                  className="flex items-start gap-3 rounded-card border border-border bg-surface px-4 py-3 text-left transition-colors duration-micro hover:bg-surface-2"
                >
                  <MapPin size={18} className="mt-0.5 text-accent" aria-hidden />
                  <span>
                    <span className="block text-body font-medium text-ink">{item.name}</span>
                    <span className="block text-body-sm text-muted">{item.address}</span>
                    <span className="mt-1 block text-meta text-muted tnum">
                      Mở cửa {item.open_time}–{item.close_time}
                    </span>
                  </span>
                </button>
              ))}
              {!loading && branches.length === 0 ? (
                <EmptyState title="Chưa có chi nhánh nào đang hoạt động" description="Vui lòng quay lại sau hoặc gọi hotline." />
              ) : null}
            </div>
          ) : null}

          {step === 'service' ? (
            <div className="flex flex-col gap-2">
              {services.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setService(item);
                    setStylist(null);
                    goTo('stylist');
                  }}
                  className="flex items-start justify-between gap-3 rounded-card border border-border bg-surface px-4 py-3 text-left transition-colors duration-micro hover:bg-surface-2"
                >
                  <span className="flex items-start gap-3">
                    <Scissors size={18} className="mt-0.5 text-accent" aria-hidden />
                    <span>
                      <span className="block text-body font-medium text-ink">{item.name}</span>
                      <span className="block text-body-sm text-muted">{item.description}</span>
                      <span className="mt-1 flex items-center gap-1 text-meta text-muted tnum">
                        <Clock size={12} aria-hidden /> {item.duration_minutes} phút
                      </span>
                    </span>
                  </span>
                  <span className="whitespace-nowrap text-body font-medium text-ink tnum">{formatVnd(item.price)}</span>
                </button>
              ))}
              <BackButton onClick={() => goTo('branch')} />
            </div>
          ) : null}

          {step === 'stylist' ? (
            <div className="flex flex-col gap-2">
              {stylists.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setStylist(item);
                    setSlot(null);
                    goTo('time');
                  }}
                  className="flex items-center gap-3 rounded-card border border-border bg-surface px-4 py-3 text-left transition-colors duration-micro hover:bg-surface-2"
                >
                  <User size={18} className="text-accent" aria-hidden />
                  <span>
                    <span className="block text-body font-medium text-ink">{item.name}</span>
                    <span className="block text-body-sm text-muted">{item.bio ?? 'Stylist của chi nhánh'}</span>
                  </span>
                </button>
              ))}
              <BackButton onClick={() => goTo('service')} />
            </div>
          ) : null}

          {step === 'time' ? (
            <div className="flex flex-col gap-3">
              <div className="flex gap-2 overflow-x-auto pb-1 thin-scroll" role="group" aria-label="Chọn ngày">
                {Array.from({ length: 14 }, (_value, index) => vnDateKey(index)).map((key) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setDate(key)}
                    aria-pressed={date === key}
                    className={`shrink-0 rounded-full border px-3 py-2 text-body-sm transition-colors duration-micro ${
                      date === key ? 'border-accent bg-accent text-surface' : 'border-border bg-surface text-ink hover:bg-surface-2'
                    }`}
                  >
                    {relativeDayLabel(key)}
                  </button>
                ))}
              </div>

              {loading ? (
                <div className="grid grid-cols-3 gap-2">
                  <Skeleton className="h-12" />
                  <Skeleton className="h-12" />
                  <Skeleton className="h-12" />
                </div>
              ) : slots.length === 0 ? (
                <EmptyState
                  icon={<CalendarDays size={20} />}
                  title={`Không còn khung giờ trống ngày ${formatDate(`${date}T00:00:00+07:00`)}`}
                  description="Chi nhánh đã kín lịch cho stylist này. Chọn ngày khác để xem khung giờ còn trống."
                />
              ) : (
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                  {slots.map((item) => (
                    <button
                      key={item.start_time}
                      type="button"
                      onClick={() => {
                        setSlot(item);
                        goTo('details');
                      }}
                      aria-pressed={slot?.start_time === item.start_time}
                      className={`rounded-control border px-2 py-2.5 text-body-sm tnum transition-colors duration-micro ${
                        slot?.start_time === item.start_time
                          ? 'border-accent bg-accent-soft text-accent'
                          : 'border-border bg-surface text-ink hover:bg-surface-2'
                      }`}
                    >
                      {formatTime(item.start_time)}
                    </button>
                  ))}
                </div>
              )}
              <BackButton onClick={() => goTo('stylist')} />
            </div>
          ) : null}

          {step === 'details' ? (
            <form
              className="flex flex-col gap-3"
              onSubmit={(event) => {
                event.preventDefault();
                void submit();
              }}
            >
              <div>
                <Label htmlFor="customer-name">Tên của bạn</Label>
                <Input
                  id="customer-name"
                  value={form.name}
                  error={fieldErrors.name}
                  autoComplete="name"
                  placeholder="Ví dụ: Nguyễn Thu Hà"
                  onChange={(event) => setForm({ ...form, name: event.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="customer-phone">Số điện thoại</Label>
                <Input
                  id="customer-phone"
                  value={form.phone}
                  error={fieldErrors.phone}
                  inputMode="tel"
                  autoComplete="tel"
                  placeholder="09xxxxxxxx"
                  onChange={(event) => setForm({ ...form, phone: event.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="customer-email">Email (không bắt buộc)</Label>
                <Input
                  id="customer-email"
                  value={form.email}
                  error={fieldErrors.email}
                  type="email"
                  autoComplete="email"
                  placeholder="ban@example.com"
                  onChange={(event) => setForm({ ...form, email: event.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="customer-note">Ghi chú (không bắt buộc)</Label>
                <Textarea
                  id="customer-note"
                  rows={2}
                  value={form.note}
                  placeholder="Ví dụ: tóc dài, muốn cắt ngắn 5cm"
                  onChange={(event) => setForm({ ...form, note: event.target.value })}
                />
              </div>

              <div className="rounded-card border border-border bg-surface-2 px-3 py-3 text-body-sm">
                <p className="font-medium text-ink">
                  {service ? `${service.name} · ${service.duration_minutes} phút` : ''}
                </p>
                <p className="text-muted tnum">
                  {branch?.name} · {stylist?.name} · {slot ? formatDateTime(slot.start_time) : ''}
                </p>
                <p className="mt-1 text-ink tnum">
                  Tạm tính {service ? formatVnd(service.price) : ''} · cọc online {service ? formatVnd(Math.round(service.price * 0.3)) : ''}
                </p>
              </div>

              <div className="flex items-center gap-2">
                <Button type="button" variant="outline" onClick={() => goTo('time')}>
                  Quay lại
                </Button>
                <Button type="submit" loading={loading} className="flex-1">
                  Xác nhận đặt lịch
                </Button>
              </div>
            </form>
          ) : null}

          {step === 'done' && booking ? (
            <div className="flex flex-col gap-3">
              <Alert tone="success" title="Đặt lịch thành công!">
                {formatDateTime(booking.start_time)} · {booking.service?.name} · {booking.stylist?.name}
              </Alert>
              <Card>
                <div className="flex flex-col gap-2 px-4 py-3 text-body-sm">
                  <Row label="Mã lịch hẹn" value={booking.id} mono />
                  <Row label="Chi nhánh" value={booking.branch?.name ?? ''} />
                  <Row label="Thời gian" value={`${formatDateTime(booking.start_time)} – ${formatTime(booking.end_time)}`} />
                  <Row label="Trạng thái" value={<Badge tone="success">Đã xác nhận</Badge>} />
                  <Row label="Tạm tính" value={formatVnd(booking.price - booking.discount_amount)} />
                  {booking.discount_amount > 0 ? (
                    <Row label="Giảm giá loyalty" value={`−${formatVnd(booking.discount_amount)}`} />
                  ) : null}
                  <Row label="Tiền cọc" value={`${formatVnd(booking.deposit_amount)} · ${booking.deposit_status === 'paid' ? 'đã cọc' : 'chưa cọc'}`} />
                  <p className="text-meta text-muted">
                    Phần còn lại thanh toán tại quầy. Hủy hoặc đổi lịch miễn phí khi còn cách giờ hẹn ít nhất 24 giờ.
                  </p>
                </div>
              </Card>

              {paymentNotice ? <Alert tone="warning" title={paymentNotice} /> : null}

              <div className="flex flex-col gap-2 sm:flex-row">
                <Button className="flex-1" onClick={() => void payDeposit()} disabled={booking.deposit_status === 'paid'}>
                  {booking.deposit_status === 'paid' ? 'Đã thanh toán cọc' : 'Đặt cọc online (VNPay)'}
                </Button>
                <Button variant="outline" onClick={restart}>
                  Đặt lịch khác
                </Button>
              </div>
            </div>
          ) : null}
        </motion.section>
      </AnimatePresence>
    </div>
  );
}

function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <Button variant="ghost" className="self-start" onClick={onClick}>
      ← Quay lại
    </Button>
  );
}

function Row({ label, value, mono = false }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="text-muted">{label}</span>
      <span className={`text-right font-medium text-ink ${mono ? 'break-all font-mono text-meta' : 'tnum'}`}>{value}</span>
    </div>
  );
}
