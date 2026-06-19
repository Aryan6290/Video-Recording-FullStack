import { Dimensions, StyleSheet } from 'react-native';
const dim = Dimensions.get('window');
export const Data = {
    designHeight: 270,
    designWidth: 125,
};
const widthscale = dim.width / Data.designWidth;
export const width = (v: number): number => v * widthscale;
export const w = (v: number): number => width(v);
export const gs = StyleSheet.create({
    btnStyle: {
        padding: 16,
    },
    pageRoot: {
        flex: 1,
        backgroundColor: '#fff',
    },
    centreContent: {
        justifyContent: 'center',
        alignItems: 'center',
    },
});