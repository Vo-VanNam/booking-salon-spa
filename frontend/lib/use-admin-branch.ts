'use client';

import * as React from 'react';
import { loadProfile } from './api';

const STORAGE_KEY = 'booking.admin_branch';

/**
 * Chi nhánh đang xem trong dashboard admin.
 *
 * Phạm vi được xác định từ server (`/auth/me`) chứ không tin localStorage:
 *  - branch_admin: LUÔN bị giới hạn ở chi nhánh của mình (server cũng chặn ở tầng API);
 *  - super_admin: mặc định toàn chuỗi, có thể chuyển chi nhánh qua bộ chọn.
 * `ready=false` nghĩa là chưa biết phạm vi — trang phải chờ để không nạp dữ liệu sai chi nhánh.
 */
export function useAdminBranch(): { branchId: string; setBranchId: (value: string) => void; ready: boolean } {
  const [branchId, setBranchIdState] = React.useState<string>('');
  const [ready, setReady] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    const stored = window.localStorage.getItem(STORAGE_KEY) ?? '';
    setBranchIdState(stored);

    loadProfile()
      .then((profile) => {
        if (cancelled) return;
        const scoped = profile.role === 'branch_admin' ? (profile.branch_id ?? '') : stored;
        setBranchIdState(scoped);
        window.localStorage.setItem(STORAGE_KEY, scoped);
        setReady(true);
      })
      .catch(() => {
        if (!cancelled) setReady(true);
      });

    const sync = () => setBranchIdState(window.localStorage.getItem(STORAGE_KEY) ?? '');
    window.addEventListener('booking:branch-change', sync);
    window.addEventListener('storage', sync);
    return () => {
      cancelled = true;
      window.removeEventListener('booking:branch-change', sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  const setBranchId = React.useCallback((value: string) => {
    window.localStorage.setItem(STORAGE_KEY, value);
    setBranchIdState(value);
    window.dispatchEvent(new Event('booking:branch-change'));
  }, []);

  return { branchId, setBranchId, ready };
}
