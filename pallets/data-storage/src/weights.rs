use frame_support::{
    traits::Get,
    weights::{Weight, constants::RocksDbWeight},
};
use core::marker::PhantomData;

/// Weight functions for pallet-data-storage.
pub trait WeightInfo {
    fn store_data() -> Weight;
    fn get_data() -> Weight;
}

/// Weights for pallet-data-storage using the recommended hardware.
pub struct SubstrateWeight<T>(PhantomData<T>);

impl<T: frame_system::Config> WeightInfo for SubstrateWeight<T> {

    /// store_data:
    /// - Writes 1 entry to StoredData
    /// - Reads + Writes 1 entry to UserData
    fn store_data() -> Weight {
        // Placeholder execution time until benchmarks run
        Weight::from_parts(20_000_000, 0)
            // DB IO (replace by real benchmark output later)
            .saturating_add(T::DbWeight::get().reads(1))  // read UserData
            .saturating_add(T::DbWeight::get().writes(2)) // write StoredData + UserData
    }

    /// get_data:
    /// - Reads 1 entry from StoredData
    fn get_data() -> Weight {
        Weight::from_parts(8_000_000, 0)
            .saturating_add(T::DbWeight::get().reads(1))
    }
}

/// Default weights for tests & no-std environments
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
