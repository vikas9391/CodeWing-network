//! Weights for pallet-template
//! Automatically generated style (manually adapted for Template Pallet)

#![cfg_attr(rustfmt, rustfmt_skip)]
#![allow(unused_imports)]
#![allow(unused_parens)]

use core::marker::PhantomData;
use frame_support::{
    traits::Get,
    weights::{Weight, constants::RocksDbWeight},
};

/// The WeightInfo trait used by the pallet.
pub trait WeightInfo {
    fn do_something() -> Weight;
    fn cause_error() -> Weight;
}

/// Weight functions for the runtime using the system's DB weights.
pub struct SubstrateWeight<T>(PhantomData<T>);
impl<T: frame_system::Config> WeightInfo for SubstrateWeight<T> {
    fn do_something() -> Weight {
        // Writes one storage value (Something)
        Weight::from_parts(9_000_000, 0)
            .saturating_add(T::DbWeight::get().writes(1))
    }

    fn cause_error() -> Weight {
        // Reads and writes `Something`
        Weight::from_parts(6_000_000, 0)
            .saturating_add(T::DbWeight::get().reads(1))
            .saturating_add(T::DbWeight::get().writes(1))
    }
}

/// Fallback weights used for testing / when no concrete type is provided.
impl WeightInfo for () {
    fn do_something() -> Weight {
        Weight::from_parts(9_000_000, 0)
            .saturating_add(RocksDbWeight::get().writes(1))
    }

    fn cause_error() -> Weight {
        Weight::from_parts(6_000_000, 0)
            .saturating_add(RocksDbWeight::get().reads(1))
            .saturating_add(RocksDbWeight::get().writes(1))
    }
}
