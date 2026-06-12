import React, { FormEvent, useEffect, useRef, useState } from 'react';
import { THEME } from './themeConstants';
import { NavigationParseResult, parseNavigationRequest } from './parseNavigationRequest';
import { useDebounce } from './useDebounce';

export interface NavigationCommandPayload {
  origin?: string;
  destination?: string;
  avoid_nodes: string[];
  rawQuery: string;
}

export interface CommandBarProps {
  onNavigationSubmit: (payload: NavigationCommandPayload) => void;
}

export function CommandBar({ onNavigationSubmit }: CommandBarProps) {
  const [rawInput, setRawInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const debouncedInput = useDebounce(rawInput, 300);
  const latestRequestId = useRef(0);

  function emitNavigationChange(nextValue: string, parsed: NavigationParseResult) {
    onNavigationSubmit({
      origin: parsed.origin ?? undefined,
      destination: parsed.destination ?? undefined,
      avoid_nodes: parsed.avoid_nodes,
      rawQuery: nextValue.trim(),
    });
  }

  useEffect(() => {
    const trimmedValue = debouncedInput.trim();
    const requestId = latestRequestId.current + 1;
    latestRequestId.current = requestId;

    if (!trimmedValue) {
      setIsLoading(false);
      setErrorMessage(null);
      onNavigationSubmit({
        origin: undefined,
        destination: undefined,
        avoid_nodes: [],
        rawQuery: '',
      });
      return undefined;
    }

    let isActive = true;
    setIsLoading(true);
    setErrorMessage(null);

    const runParse = async () => {
      try {
        const parsed = await parseNavigationRequest(trimmedValue);

        if (!isActive || latestRequestId.current !== requestId) {
          return;
        }

        setIsLoading(false);
        emitNavigationChange(trimmedValue, parsed);
      } catch (error) {
        if (!isActive || latestRequestId.current !== requestId) {
          return;
        }

        const message = error instanceof Error ? error.message : 'Navigation parsing failed.';
        setIsLoading(false);
        setErrorMessage(message);
      }
    };

    void runParse();

    return () => {
      isActive = false;
    };
  }, [debouncedInput, onNavigationSubmit]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedValue = rawInput.trim();

    if (!trimmedValue) {
      return;
    }

    const requestId = latestRequestId.current + 1;
    latestRequestId.current = requestId;
    setIsLoading(true);
    setErrorMessage(null);

    void (async () => {
      try {
        const parsed = await parseNavigationRequest(trimmedValue);

        if (latestRequestId.current !== requestId) {
          return;
        }

        setIsLoading(false);
        emitNavigationChange(trimmedValue, parsed);
      } catch (error) {
        if (latestRequestId.current !== requestId) {
          return;
        }

        const message = error instanceof Error ? error.message : 'Navigation parsing failed.';
        setIsLoading(false);
        setErrorMessage(message);
      }
    })();
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="fixed bottom-6 left-1/2 z-50 w-[min(92vw,760px)] -translate-x-1/2"
    >
      <div
        className="flex items-center gap-3 rounded-full border border-white/12 bg-white/5 px-4 py-3 shadow-2xl shadow-black/40 backdrop-blur-xl"
        style={{ backdropFilter: 'blur(12px)' }}
      >
        <div className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/5 text-sm font-semibold text-white/85">
          AI
        </div>

        <input
          value={rawInput}
          onChange={(event) => {
            const nextValue = event.target.value;
            setRawInput(nextValue);
          }}
          type="text"
          spellCheck={false}
          autoComplete="off"
          autoCorrect="off"
          placeholder="Ask for a route: from Library to Main_Gate, avoid Hostel_A"
          className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-white/40"
          style={{
            fontFamily: 'Inter var, Inter, ui-sans-serif, system-ui, sans-serif',
          }}
        />

        <div className="min-w-[72px] text-right text-[11px] tracking-wide text-white/40">
          {isLoading ? 'Parsing…' : errorMessage ? 'Parse error' : 'Ready'}
        </div>

        <button
          type="submit"
          className="inline-flex items-center rounded-full border border-emerald-400/30 bg-emerald-400/10 px-4 py-2 text-sm font-medium text-emerald-200 transition-colors hover:bg-emerald-400/18 hover:text-white"
          disabled={isLoading}
          style={{
            color: THEME.primaryAccent,
            textShadow: `0 0 10px ${THEME.primaryAccent}`,
            opacity: isLoading ? 0.7 : 1,
          }}
        >
          Navigate
        </button>
      </div>

      {errorMessage ? (
        <div className="mt-2 px-3 text-center text-[11px] tracking-wide text-red-200/75">
          {errorMessage}
        </div>
      ) : (
      <div className="mt-2 px-3 text-center text-[11px] tracking-wide text-white/35">
        Try commands like “from Library to Auditorium avoid Hostel_A” or “go to Main_Gate avoid Cafeteria”.
      </div>
      )}
    </form>
  );
}

export default CommandBar;
