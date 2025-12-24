#![cfg_attr(rustfmt, rustfmt_skip)]
#![allow(unused_parens)]
#![allow(unused_imports)]
use frame_support::{
    traits::Get,
    weights::{Weight, constants::RocksDbWeight},
};
use core::marker::PhantomData;

pub trait WeightInfo {
    fn store_data() -> Weight;
    fn get_data() -> Weight;
}

pub struct SubstrateWeight<T>(PhantomData<T>);

impl<T: frame_system::Config> WeightInfo for SubstrateWeight<T> {
    fn store_data() -> Weight {
        Weight::from_parts(20_000_000, 0)
            .saturating_add(T::DbWeight::get().reads(1))
            .saturating_add(T::DbWeight::get().writes(2))
    }

    fn get_data() -> Weight {
        Weight::from_parts(8_000_000, 0)
            .saturating_add(T::DbWeight::get().reads(1))
    }
}

impl WeightInfo for () {
    fn store_data() -> Weight {
        Weight::from_parts(20_000_000, 0)
            .saturating_add(RocksDbWeight::get().reads(1))
            .saturating_add(RocksDbWeight::get().writes(2))
    }

    fn get_data() -> Weight {
        Weight::from_parts(8_000_000, 0)
            .saturating_add(RocksDbWeight::get().reads(1))
    }
}
