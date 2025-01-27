import { useRef, useEffect, useState, useCallback } from 'react';

type SetStateAction<S> = S | ((prevState: S) => S);
type SetState<S> = (action: SetStateAction<S>) => void;

/** This is a drop-in replacement for useState, limited to object-based state. During initial mount it will mutably update the state, instead of scheduling a React update using setState */
export const useImmediateState = <S extends {}>(init: S): [S, SetState<S>] => {
  const isMounted = useRef(false);
  const initialState = useRef<S>({ ...init });
  const [state, setState] = useState<S>(initialState.current);

  // This wraps setState and updates the state mutably on initial mount
  // It also prevents setting the state when the component is unmounted
  const updateState: SetState<S> = useCallback((action: SetStateAction<S>) => {
    if (isMounted.current) {
      setState(action);
    } else if (typeof action === 'function') {
      const update = (action as any)(initialState.current);
      Object.assign(initialState.current, update);
    } else {
      // There are scenario's where we are in-between mounts.
      // The reason we need both is because we COULD still be mounting
      // and we could be in the process of being mounted.
      // Scenario 1 needs the initialState.current mutation.
      // Scenario 2 needs the setState.
      // See https://github.com/FormidableLabs/urql/issues/287
      setState(() => Object.assign(initialState.current, action as any));
    }
  }, []);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  return [state, updateState];
};
