import {
  assertCanAccessBranch,
  resolveBranchId,
  type ScopeUser,
} from './branch-scope';

describe('branch-scope', () => {
  it('allows super_admin to access any branch', () => {
    expect(() =>
      assertCanAccessBranch(
        { role: 'super_admin', branchId: null },
        'any-branch',
      ),
    ).not.toThrow();
  });

  it('allows branch_admin to access their own branch', () => {
    expect(() =>
      assertCanAccessBranch({ role: 'branch_admin', branchId: 'b1' }, 'b1'),
    ).not.toThrow();
  });

  it('rejects branch_admin accessing another branch', () => {
    expect(() =>
      assertCanAccessBranch({ role: 'branch_admin', branchId: 'b1' }, 'b2'),
    ).toThrow('Bạn không có quyền truy cập chi nhánh này');
  });

  it('rejects customer role from accessing any branch', () => {
    expect(() =>
      assertCanAccessBranch({ role: 'customer', branchId: null }, 'b1'),
    ).toThrow('Bạn không có quyền truy cập chi nhánh này');
  });

  it('rejects stylist role from accessing any branch', () => {
    expect(() =>
      assertCanAccessBranch({ role: 'stylist', branchId: 'b1' }, 'b1'),
    ).toThrow('Bạn không có quyền truy cập chi nhánh này');
  });

  it('rejects undefined role from accessing any branch', () => {
    expect(() =>
      assertCanAccessBranch({ role: undefined } as unknown as ScopeUser, 'b1'),
    ).toThrow('Bạn không có quyền truy cập chi nhánh này');
  });

  it('resolves branch_admin to their own branch, ignoring the param', () => {
    expect(
      resolveBranchId({ role: 'branch_admin', branchId: 'b1' }, 'b2'),
    ).toBe('b1');
  });

  it('resolves super_admin to the given branch param', () => {
    expect(resolveBranchId({ role: 'super_admin', branchId: null }, 'b2')).toBe(
      'b2',
    );
  });

  it('throws when super_admin is missing the branch param', () => {
    expect(() =>
      resolveBranchId({ role: 'super_admin', branchId: null }, undefined),
    ).toThrow('Thiếu chi nhánh');
  });

  it('throws when branch_admin has no branchId', () => {
    expect(() =>
      resolveBranchId({ role: 'branch_admin', branchId: null }, 'b2'),
    ).toThrow('Thiếu chi nhánh');
  });
});
