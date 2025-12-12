#![cfg(feature = "runtime-benchmarks")]

use super::*;
use frame_benchmarking::{benchmarks, whitelisted_caller};
use frame_system::RawOrigin;

benchmarks! {
    store_data {
        let caller: T::AccountId = whitelisted_caller();
        let key = b"MyKey".to_vec();
        let value = b"MyValue".to_vec();
    }: _(RawOrigin::Signed(caller), key.clone(), value.clone())
    verify {
        assert!(DataStorageMap::<T>::contains_key(key));
    }
}

impl_benchmark_test_suite!(
    Pallet,
    crate::mock::new_test_ext(),
    crate::mock::Test,
);
