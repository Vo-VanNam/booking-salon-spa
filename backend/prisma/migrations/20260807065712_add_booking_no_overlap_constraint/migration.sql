-- Lop phong thu 2 chong dat trung slot (ngoai SELECT ... FOR UPDATE): giam sat
-- bang constraint loai tru (exclusion) tren gist, chi ap dung cho booking dang
-- hieu luc (pending/confirmed) de cho phep huy/qua han cung luc slot.
-- Luu y: dung tsrange (khong timezone) thay vi tstzrange — Prisma map DateTime
-- sang timestamp(3) without time zone, tstzrange buoc phai implicit cast qua ham
-- STABLE (timestamp_timestamptz) nen Postgres tu choi dung trong index expression.
-- Du lieu luu trong 2 cot la UTC thuan nen tsrange cho ket qua overlap tuong duong.
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE "Booking" ADD CONSTRAINT "booking_no_overlap"
  EXCLUDE USING gist ("stylistId" WITH =, tsrange("startTime","endTime") WITH &&)
  WHERE ("status" IN ('pending','confirmed'));
