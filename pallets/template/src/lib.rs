//! Auto-generated weights template for pallet-template

#![cfg_attr(rustfmt, rustfmt_skip)]
#![allow(unused_imports)]
#![allow(unused_parens)]

use frame_support::{
    traits::Get,
    weights::{Weight, constants::RocksDbWeight},
};
use core::marker::PhantomData;

pub trait WeightInfo {
    fn do_something() -> Weight;
    fn cause_error() -> Weight;
}

pub struct SubstrateWeight<T>(PhantomData<T>);

impl<T: frame_system::Config> WeightInfo for SubstrateWeight<T> {

    fn do_something() -> Weight {
        Weight::from_parts(9_000_000, 0)
            .saturating_add(T::DbWeight::get().writes(1))
    }

    fn cause_error() -> Weight {
        Weight::from_parts(6_000_000, 1489)
            .saturating_add(T::DbWeight::get().reads(1))
            .saturating_add(T::DbWeight::get().writes(1))
    }
}

impl WeightInfo for () {

    fn do_something() -> Weight {
        Weight::from_parts(9_000_000, 0)
            .saturating_add(RocksDbWeight::get().writes(1))
    }

    fn cause_error() -> Weight {
        Weight::from_parts(6_000_000, 1489)
            .saturating_add(RocksDbWeight::get().reads(1))
            .saturating_add(RocksDbWeight::get().writes(1))
    }
}

