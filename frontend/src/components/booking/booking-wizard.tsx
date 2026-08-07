"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronLeft } from "lucide-react";
import { addDays, format } from "date-fns";
import { vi } from "date-fns/locale";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";

import type {
  AuthResponse,
  BookingResponse,
  Branch,
  Service,
  SlotResult,
  Stylist,
} from "@/lib/api";
import { apiGet, apiPost, ApiError, saveAuth } from "@/lib/api";
import { getAccessToken, getStoredUser } from "@/lib/token-store";
import { vnToUtcIso } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  BranchStep,
  ConfirmStep,
  CustomerInfoStep,
  customerSchema,
  DateTimeStep,
  FALLBACK_ERROR,
  ServiceStep,
  StylistStep,
  type CustomerFormValues,
  type DateOption,
  type SlotsState,
} from "./booking-steps";
import { SuccessView } from "./success-view";

const STEP_LABELS = ["Chi nhánh", "Dịch vụ", "Stylist", "Thời gian", "Thông tin", "Xác nhận"];

function generatePassword(): string {
  const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  const bytes = new Uint32Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => charset[byte % charset.length]).join("");
}

export function BookingWizard() {
  const [step, setStep] = useState(0);
  const [branch, setBranch] = useState<Branch | null>(null);
  const [service, setService] = useState<Service | null>(null);
  const [stylist, setStylist] = useState<Stylist | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);

  const [booking, setBooking] = useState<BookingResponse | null>(null);
  const [loggedIn, setLoggedIn] = useState(() => Boolean(getStoredUser() || getAccessToken()));
  const [submitting, setSubmitting] = useState(false);
  const [needsLogin, setNeedsLogin] = useState(false);
  const [loginPassword, setLoginPassword] = useState("");
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loginLoading, setLoginLoading] = useState(false);
  const [autoRegistered, setAutoRegistered] = useState<{ phone: string; password: string } | null>(
    null,
  );

  // Bước 1: danh sách chi nhánh
  const [branchesVersion, setBranchesVersion] = useState(0);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchesLoading, setBranchesLoading] = useState(true);
  const [branchesError, setBranchesError] = useState<string | null>(null);

  // Bước 2 + 3: dịch vụ và stylist của chi nhánh
  const [branchDataVersion, setBranchDataVersion] = useState(0);
  const [services, setServices] = useState<Service[]>([]);
  const [servicesLoading, setServicesLoading] = useState(false);
  const [servicesError, setServicesError] = useState<string | null>(null);
  const [stylists, setStylists] = useState<Stylist[]>([]);
  const [stylistsLoading, setStylistsLoading] = useState(false);
  const [stylistsError, setStylistsError] = useState<string | null>(null);

  // Bước 4: khung giờ trống
  const [slotsVersion, setSlotsVersion] = useState(0);
  const [slots, setSlots] = useState<SlotsState>({ loading: false, error: null, data: null });

  const form = useForm<CustomerFormValues>({
    resolver: zodResolver(customerSchema),
    mode: "onChange",
    defaultValues: { name: "", phone: "", email: "", note: "" },
  });

  useEffect(() => {
    let cancelled = false;
    setBranchesLoading(true);
    setBranchesError(null);
    apiGet<Branch[]>("/branches", true)
      .then((data) => {
        if (!cancelled) setBranches(data);
      })
      .catch((e) => {
        if (!cancelled) setBranchesError(e instanceof ApiError ? e.message : FALLBACK_ERROR);
      })
      .finally(() => {
        if (!cancelled) setBranchesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [branchesVersion]);

  useEffect(() => {
    if (!branch) return;
    let cancelled = false;
    setServicesLoading(true);
    setServicesError(null);
    setStylistsLoading(true);
    setStylistsError(null);
    apiGet<Service[]>(`/branches/${branch.id}/services`, true)
      .then((data) => {
        if (!cancelled) setServices(data);
      })
      .catch((e) => {
        if (!cancelled) setServicesError(e instanceof ApiError ? e.message : FALLBACK_ERROR);
      })
      .finally(() => {
        if (!cancelled) setServicesLoading(false);
      });
    apiGet<Stylist[]>(`/branches/${branch.id}/stylists`, true)
      .then((data) => {
        if (!cancelled) setStylists(data);
      })
      .catch((e) => {
        if (!cancelled) setStylistsError(e instanceof ApiError ? e.message : FALLBACK_ERROR);
      })
      .finally(() => {
        if (!cancelled) setStylistsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [branch, branchDataVersion]);

  useEffect(() => {
    if (!branch || !service || !stylist || !selectedDate) return;
    let cancelled = false;
    setSlots({ loading: true, error: null, data: null });
    apiGet<SlotResult>(
      `/stylists/${stylist.id}/slots?branchId=${branch.id}&date=${selectedDate}&durationMinutes=${service.durationMinutes}`,
      true,
    )
      .then((data) => {
        if (!cancelled) setSlots({ loading: false, error: null, data });
      })
      .catch((e) => {
        if (!cancelled) {
          setSlots({ loading: false, error: e instanceof ApiError ? e.message : FALLBACK_ERROR, data: null });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [branch, service, stylist, selectedDate, slotsVersion]);

  useEffect(() => {
    const user = getStoredUser();
    if (user?.name) form.setValue("name", user.name);
    if (user?.phone) form.setValue("phone", user.phone);
  }, [form]);

  const dateOptions = useMemo<DateOption[]>(() => {
    const today = new Date();
    return Array.from({ length: 7 }, (_, i) => {
      const date = addDays(today, i);
      return {
        key: format(date, "yyyy-MM-dd"),
        headline: i === 0 ? "Hôm nay" : format(date, "EEE", { locale: vi }),
        dayMonth: format(date, "dd/MM"),
      };
    });
  }, []);

  function handleSelectBranch(next: Branch) {
    setBranch(next);
    setService(null);
    setStylist(null);
    setSelectedDate(null);
    setSelectedTime(null);
    setStep(1);
  }

  function handleSelectService(next: Service) {
    setService(next);
    setStylist(null);
    setSelectedDate(null);
    setSelectedTime(null);
    setStep(2);
  }

  function handleSelectStylist(next: Stylist) {
    setStylist(next);
    setSelectedDate(null);
    setSelectedTime(null);
    setStep(3);
  }

  function handleSelectDate(date: string) {
    setSelectedDate(date);
    setSelectedTime(null);
  }

  async function handleLogin() {
    if (loginLoading || !loginPassword) return;
    const values = form.getValues();
    setLoginLoading(true);
    setLoginError(null);
    try {
      const res = await apiPost<AuthResponse>(
        "/auth/login",
        { phoneOrEmail: values.phone, password: loginPassword },
        true,
      );
      saveAuth(res);
      setLoggedIn(true);
      setNeedsLogin(false);
      setLoginPassword("");
    } catch (e) {
      setLoginError(e instanceof ApiError ? e.message : FALLBACK_ERROR);
    } finally {
      setLoginLoading(false);
    }
  }

  async function handleConfirm() {
    if (submitting || needsLogin || !branch || !service || !stylist || !selectedDate || !selectedTime) {
      return;
    }
    const values = form.getValues();
    setSubmitting(true);
    try {
      if (!loggedIn) {
        const password = generatePassword();
        try {
          const res = await apiPost<AuthResponse>(
            "/auth/register",
            {
              name: values.name,
              phone: values.phone,
              email: values.email || undefined,
              password,
            },
            true,
          );
          saveAuth(res);
          setLoggedIn(true);
          setAutoRegistered({ phone: values.phone, password });
        } catch (e) {
          if (e instanceof ApiError && e.statusCode === 409) {
            setNeedsLogin(true);
            setSubmitting(false);
            return;
          }
          throw e;
        }
      }

      const created = await apiPost<BookingResponse>(
        "/bookings",
        {
          branchId: branch.id,
          serviceId: service.id,
          stylistId: stylist.id,
          startTime: vnToUtcIso(selectedDate, selectedTime),
          ...(values.note.trim() ? { note: values.note.trim() } : {}),
        },
      );
      setBooking(created);
    } catch (e) {
      if (e instanceof ApiError && e.statusCode === 409) {
        toast.error(e.message);
        setSelectedTime(null);
        setSlotsVersion((v) => v + 1);
        setStep(3);
      } else {
        toast.error(e instanceof ApiError ? e.message : FALLBACK_ERROR);
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (booking && branch && service && stylist) {
    return (
      <SuccessView
        booking={booking}
        branch={branch}
        service={service}
        stylist={stylist}
        autoRegistered={autoRegistered}
      />
    );
  }

  let content: ReactNode = null;
  if (step === 0) {
    content = (
      <BranchStep
        branches={branches}
        loading={branchesLoading}
        error={branchesError}
        onRetry={() => setBranchesVersion((v) => v + 1)}
        onSelect={handleSelectBranch}
      />
    );
  } else if (step === 1) {
    content = (
      <ServiceStep
        services={services}
        loading={servicesLoading}
        error={servicesError}
        onRetry={() => setBranchDataVersion((v) => v + 1)}
        onSelect={handleSelectService}
      />
    );
  } else if (step === 2 && branch) {
    content = (
      <StylistStep
        stylists={stylists}
        loading={stylistsLoading}
        error={stylistsError}
        onRetry={() => setBranchDataVersion((v) => v + 1)}
        onSelect={handleSelectStylist}
      />
    );
  } else if (step === 3 && branch && service && stylist) {
    content = (
      <DateTimeStep
        dateOptions={dateOptions}
        selectedDate={selectedDate}
        selectedTime={selectedTime}
        slots={slots}
        onSelectDate={handleSelectDate}
        onSelectTime={setSelectedTime}
        onRetrySlots={() => setSlotsVersion((v) => v + 1)}
        onNext={() => setStep(4)}
      />
    );
  } else if (step === 4) {
    content = <CustomerInfoStep form={form} onNext={() => setStep(5)} />;
  } else if (step === 5 && branch && service && stylist && selectedDate && selectedTime) {
    content = (
      <ConfirmStep
        branch={branch}
        service={service}
        stylist={stylist}
        selectedDate={selectedDate}
        selectedTime={selectedTime}
        note={form.watch("note") ?? ""}
        needsLogin={needsLogin}
        loginPassword={loginPassword}
        loginError={loginError}
        loginLoading={loginLoading}
        submitting={submitting}
        onLoginPasswordChange={setLoginPassword}
        onLogin={handleLogin}
        onConfirm={handleConfirm}
      />
    );
  }

  return (
    <div className="mx-auto min-h-screen w-full max-w-md px-4 pb-12">
      <header className="sticky top-0 z-10 -mx-4 mb-4 border-b border-border bg-background/95 px-4 py-3 backdrop-blur">
        <div className="flex items-center gap-3">
          {step > 0 && (
            <Button
              variant="ghost"
              size="icon"
              aria-label="Quay lại"
              onClick={() => setStep((s) => s - 1)}
            >
              <ChevronLeft className="size-5" />
            </Button>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">
              Bước {step + 1}/6 · {STEP_LABELS[step]}
            </p>
            <div className="mt-1.5 flex gap-1.5">
              {STEP_LABELS.map((_, i) => (
                <div
                  key={i}
                  className={cn(
                    "h-1.5 rounded-full transition-all duration-300",
                    i === step ? "w-5 bg-primary" : i < step ? "w-1.5 bg-primary/60" : "w-1.5 bg-border",
                  )}
                />
              ))}
            </div>
          </div>
        </div>
      </header>

      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={step}
          initial={{ opacity: 0, x: 32 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -32 }}
          transition={{ duration: 0.25 }}
        >
          {content}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
