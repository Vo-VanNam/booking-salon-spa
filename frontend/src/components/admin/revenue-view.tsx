"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { format, subDays } from "date-fns";
import { toast } from "sonner";

import { useAuth } from "@/components/auth/route-guard";
import { BranchFilter } from "@/components/admin/branch-filter";
import { ApiError, apiGet, type RevenueResponse } from "@/lib/api";
import { formatVnd } from "@/lib/format";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const FALLBACK_ERROR = "Đã có lỗi xảy ra, vui lòng thử lại sau";

function periodLabel(period: string, groupBy: string): string {
  if (groupBy === "month") {
    return format(new Date(`${period}-01T00:00:00`), "MM/yyyy");
  }
  return format(new Date(`${period}T00:00:00`), "dd/MM");
}

const vndAxis = (value: number) =>
  value >= 1_000_000 ? `${(value / 1_000_000).toLocaleString("vi-VN")}tr` : `${value.toLocaleString("vi-VN")}k`;

function SummaryCard({ label, value, suffix }: { label: string; value: number; suffix?: string }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="font-number text-xl font-semibold sm:text-2xl">
          {suffix ? `${value.toLocaleString("vi-VN")} ${suffix}` : formatVnd(value)}
        </p>
      </CardContent>
    </Card>
  );
}

export function RevenueView() {
  const { user } = useAuth();
  const isSuper = user?.role === "super_admin";

  const today = format(new Date(), "yyyy-MM-dd");
  const [from, setFrom] = useState(format(subDays(new Date(), 30), "yyyy-MM-dd"));
  const [to, setTo] = useState(today);
  const [groupBy, setGroupBy] = useState<"day" | "month">("day");
  const [branchId, setBranchId] = useState("");
  const branchReady = isSuper ? branchId !== "" : true;

  const [data, setData] = useState<RevenueResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(() => {
    if (!branchReady) return;
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ from, to, groupBy });
    if (isSuper) params.set("branchId", branchId);
    apiGet<RevenueResponse>(`/admin/revenue?${params.toString()}`)
      .then(setData)
      .catch((e) => {
        setError(e instanceof ApiError ? e.message : FALLBACK_ERROR);
        if (e instanceof ApiError) toast.error(e.message);
      })
      .finally(() => setLoading(false));
  }, [branchReady, isSuper, branchId, from, to, groupBy]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const rows = data?.rows ?? [];
  const summary = data?.summary;

  const chartData = rows.map((row) => ({
    ...row,
    label: periodLabel(row.period, groupBy),
  }));

  if (!branchReady) {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-xl font-semibold">Doanh thu</h1>
          <BranchFilter value={branchId} onChange={setBranchId} />
        </div>
        <div className="flex flex-col items-center gap-3 rounded-xl border border-border bg-muted px-6 py-16 text-center">
          <p className="text-sm text-muted-foreground">
            Vui lòng chọn chi nhánh để xem doanh thu
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Doanh thu</h1>
        <BranchFilter value={branchId} onChange={setBranchId} />
      </div>

      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-card p-3">
        <div className="flex flex-col gap-1.5">
          <Label>Từ ngày</Label>
          <Input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} className="w-40" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Đến ngày</Label>
          <Input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} className="w-40" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Nhóm theo</Label>
          <Select value={groupBy} onValueChange={(v) => setGroupBy(v as "day" | "month")}>
            <SelectTrigger className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="day">Theo ngày</SelectItem>
              <SelectItem value="month">Theo tháng</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button onClick={fetchData} disabled={loading}>
          {loading ? "Đang tải..." : "Xem báo cáo"}
        </Button>
      </div>

      {error ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-border bg-muted px-6 py-12 text-center">
          <p className="text-sm text-muted-foreground">{error}</p>
          <Button variant="outline" onClick={fetchData}>
            Thử lại
          </Button>
        </div>
      ) : loading && !data ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      ) : summary ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <SummaryCard label="Tổng doanh thu" value={summary.total} />
            <SummaryCard label="Tiền cọc đã thu" value={summary.depositCollected} />
            <SummaryCard label="Thanh toán tại quầy" value={summary.counterPaid} />
            <SummaryCard label="Số lịch hẹn" value={summary.bookingCount} suffix="lịch" />
            <SummaryCard label="Hoàn thành" value={summary.completedCount} suffix="lịch" />
            <SummaryCard label="Đã hủy" value={summary.cancelledCount} suffix="lịch" />
          </div>

          {rows.length === 0 ? (
            <div className="rounded-xl border border-border bg-muted px-6 py-12 text-center text-sm text-muted-foreground">
              Không có dữ liệu doanh thu trong khoảng thời gian này
            </div>
          ) : (
            <>
              <div className="grid gap-4 xl:grid-cols-2">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Tổng doanh thu theo {groupBy === "month" ? "tháng" : "ngày"}</CardTitle>
                  </CardHeader>
                  <CardContent className="h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                        <XAxis dataKey="label" tick={{ fontSize: 12 }} tickLine={false} />
                        <YAxis tickFormatter={vndAxis} tick={{ fontSize: 12 }} tickLine={false} width={60} />
                        <Tooltip formatter={(value) => formatVnd(Number(value))} />
                        <Bar dataKey="total" name="Tổng doanh thu" fill="var(--chart-1)" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Cọc và thanh toán tại quầy</CardTitle>
                  </CardHeader>
                  <CardContent className="h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                        <XAxis dataKey="label" tick={{ fontSize: 12 }} tickLine={false} />
                        <YAxis tickFormatter={vndAxis} tick={{ fontSize: 12 }} tickLine={false} width={60} />
                        <Tooltip formatter={(value) => formatVnd(Number(value))} />
                        <Legend />
                        <Line type="monotone" dataKey="depositCollected" name="Tiền cọc" stroke="var(--chart-2)" strokeWidth={2} dot={false} />
                        <Line type="monotone" dataKey="counterPaid" name="Tại quầy" stroke="var(--chart-3)" strokeWidth={2} dot={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              </div>

              <div className="overflow-x-auto rounded-xl border border-border bg-card">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Kỳ</TableHead>
                      <TableHead className="text-right">Tiền cọc</TableHead>
                      <TableHead className="text-right">Tại quầy</TableHead>
                      <TableHead className="text-right">Tổng</TableHead>
                      <TableHead className="text-right">Số lịch</TableHead>
                      <TableHead className="text-right">Hoàn thành</TableHead>
                      <TableHead className="text-right">Đã hủy</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((row) => (
                      <TableRow key={row.period}>
                        <TableCell className="font-number">{periodLabel(row.period, groupBy)}</TableCell>
                        <TableCell className="text-right font-number">{formatVnd(row.depositCollected)}</TableCell>
                        <TableCell className="text-right font-number">{formatVnd(row.counterPaid)}</TableCell>
                        <TableCell className="text-right font-number font-medium">{formatVnd(row.total)}</TableCell>
                        <TableCell className="text-right font-number">{row.bookingCount}</TableCell>
                        <TableCell className="text-right font-number">{row.completedCount}</TableCell>
                        <TableCell className="text-right font-number">{row.cancelledCount}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </>
      ) : null}
    </div>
  );
}
