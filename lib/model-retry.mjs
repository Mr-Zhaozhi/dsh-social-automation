// Persist across ticks and restarts; success resets it. Never retry delivery here.
export function deferModelFailure(state,now=Date.now()){
 const failures=Math.min(8,(Number(state.modelFailures)||0)+1);
 return {...state,modelFailures:failures,modelRetryAt:now+Math.min(30,5*2**(failures-1))*60000};
}
export function clearModelFailure(state){delete state.modelFailures;delete state.modelRetryAt;return state;}
