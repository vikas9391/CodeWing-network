#![cfg(feature = "runtime-benchmarks")]

use super::*;
use frame_benchmarking::{benchmarks, whitelisted_caller};
use frame_system::RawOrigin;

benchmarks! {
    store_data {
        let caller: T::AccountId = whitelisted_caller();
        let data: Vec<u8> = vec![0u8; 32];
    }: _(RawOrigin::Signed(caller.clone()), data.clone())
    verify {
        // verify using storage if desired
    }

    get_data {
        let caller: T::AccountId = whitelisted_caller();
        let data: Vec<u8> = vec![0u8; 32];
        let bounded: BoundedVec<u8, ConstU32<1024>> = data.try_into().unwrap();
        let hash = T::Hashing::hash_of(&bounded);
        StoredData::<T>::insert(hash, bounded);
    }: _(RawOrigin::Signed(caller), hash)
    verify {
    }
}

impl_benchmark_test_suite!(
    Pallet,
    crate::mock::new_test_ext(),
    crate::mock::Test,
);
