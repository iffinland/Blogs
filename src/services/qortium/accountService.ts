import type { AccountProfile } from '../../types/blog';
import { requestQortium } from './qortiumClient';

const readName = (value: unknown): string => {
  if (typeof value === 'string') return value.trim();
  if (
    value &&
    typeof value === 'object' &&
    typeof (value as { name?: unknown }).name === 'string'
  ) {
    return ((value as { name: string }).name ?? '').trim();
  }
  return '';
};

const uniqueNames = (names: string[]) =>
  Array.from(new Set(names.map((name) => name.trim()).filter(Boolean)));

const normalizeNamesList = (value: unknown): string[] => {
  if (!Array.isArray(value)) return value ? [readName(value)].filter(Boolean) : [];
  return value.map(readName).filter(Boolean);
};

export const normalizeAccountNames = (value: unknown): string[] => {
  if (Array.isArray(value)) return uniqueNames(normalizeNamesList(value));
  if (!value || typeof value !== 'object') return [];

  const record = value as Record<string, unknown>;
  const nested =
    record.account && typeof record.account === 'object'
      ? (record.account as Record<string, unknown>)
      : {};
  const rawNames =
    record.names ??
    record.registeredNames ??
    record.nameData ??
    record.accountNames ??
    record.nameList ??
    record.userNames ??
    nested.names ??
    nested.registeredNames ??
    nested.nameData ??
    nested.accountNames ??
    nested.nameList ??
    nested.userNames ??
    [];

  const selectedName =
    readName(record.name) ||
    readName(record.selectedName) ||
    readName(record.activeName) ||
    readName(nested.name) ||
    readName(nested.selectedName) ||
    readName(nested.activeName);

  return uniqueNames([selectedName, ...normalizeNamesList(rawNames)]);
};

const readAddress = (value: unknown) => {
  if (!value || typeof value !== 'object') return '';
  const record = value as Record<string, unknown>;
  const nested =
    record.account && typeof record.account === 'object'
      ? (record.account as Record<string, unknown>)
      : {};
  return (
    (typeof record.address === 'string' && record.address.trim()) ||
    (typeof nested.address === 'string' && nested.address.trim()) ||
    ''
  );
};

export const getAccountNames = async (address: string): Promise<string[]> => {
  const normalizedAddress = address.trim();
  if (!normalizedAddress) return [];

  try {
    const response = await requestQortium<unknown>({
      action: 'GET_ACCOUNT_NAMES',
      address: normalizedAddress,
    });
    return normalizeAccountNames(response);
  } catch {
    return [];
  }
};

export const getSelectedAccount = async (): Promise<AccountProfile> => {
  const account = await requestQortium<unknown>({ action: 'GET_SELECTED_ACCOUNT' });
  const address = readAddress(account);
  const selectedAccountNames = normalizeAccountNames(account);
  const registeredNames = await getAccountNames(address);
  const names = uniqueNames([...selectedAccountNames, ...registeredNames]);

  return {
    address,
    name: names[0] ?? '',
    names,
    raw: account,
  };
};
