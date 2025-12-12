#![cfg_attr(not(feature = "std"), no_std)]

pub mod weights;

pub use pallet::*;

#[frame_support::pallet]
pub mod pallet {
    use frame_support::{pallet_prelude::*, BoundedVec};
    use frame_system::pallet_prelude::*;
    use crate::weights::WeightInfo;

    // Import Hash trait
    use sp_runtime::traits::Hash;

    #[pallet::pallet]
    pub struct Pallet<T>(_);

    // CONFIG
    #[pallet::config]
    pub trait Config: frame_system::Config {
        type RuntimeEvent: From<Event<Self>>
            + IsType<<Self as frame_system::Config>::RuntimeEvent>;
        type WeightInfo: WeightInfo;
    }

    // STORAGE -----------------------------------

    #[pallet::storage]
    pub type StoredData<T: Config> = StorageMap<
        _,
        Blake2_128Concat,
        T::Hash,
        BoundedVec<u8, ConstU32<1024>>,
        OptionQuery
    >;

    #[pallet::storage]
    pub type UserData<T: Config> = StorageMap<
        _,
        Blake2_128Concat,
        T::AccountId,
        BoundedVec<T::Hash, ConstU32<100>>,
        ValueQuery
    >;

    // EVENTS ------------------------------------

    #[pallet::event]
    #[pallet::generate_deposit(pub(super) fn deposit_event)]
    pub enum Event<T: Config> {
        DataStored { who: T::AccountId, hash: T::Hash },
        DataRetrieved { hash: T::Hash },
    }

    // ERRORS ------------------------------------
    #[pallet::error]
    pub enum Error<T> {
        DataNotFound,
        DataTooLarge,
        TooManyEntries,
    }

    // CALLS -------------------------------------

    #[pallet::call]
    impl<T: Config> Pallet<T> {

        #[pallet::call_index(0)]
        #[pallet::weight(T::WeightInfo::store_data())]
        pub fn store_data(origin: OriginFor<T>, data: Vec<u8>) -> DispatchResult {
            let who = ensure_signed(origin)?;

            let bounded: BoundedVec<u8, ConstU32<1024>> =
                data.try_into().map_err(|_| Error::<T>::DataTooLarge)?;

            // Correct hashing function
            let hash = T::Hashing::hash_of(&bounded);

            StoredData::<T>::insert(hash, bounded);

            UserData::<T>::try_mutate(&who, |list| {
                list.try_push(hash).map_err(|_| Error::<T>::TooManyEntries)
            })?;

            Self::deposit_event(Event::DataStored { who, hash });
            Ok(())
        }

        #[pallet::call_index(1)]
        #[pallet::weight(T::WeightInfo::get_data())]
        pub fn get_data(origin: OriginFor<T>, hash: T::Hash) -> DispatchResult {
            let _ = ensure_signed(origin)?;

            ensure!(StoredData::<T>::contains_key(hash), Error::<T>::DataNotFound);

            Self::deposit_event(Event::DataRetrieved { hash });
            Ok(())
        }
    }
}
