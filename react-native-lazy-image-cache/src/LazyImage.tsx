import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Image,
  ImageProps,
  ActivityIndicator,
  View,
  ImageSourcePropType,
  NativeSyntheticEvent,
  ImageErrorEventData,
  Dimensions,
  Platform,
  UIManager,
  findNodeHandle,
  ScrollView,
} from 'react-native';
import { getCachedImage } from './imageCache';
import { downloadQueue } from './downloadQueue';
import RNFS from 'react-native-fs';
import { StyleSheet } from 'react-native';

interface LazyImageProps extends Omit<ImageProps, 'source'> {
  source: ImageSourcePropType;
  placeholderColor?: string;
  placeholderSource?: ImageSourcePropType;
  fallbackSource?: ImageSourcePropType;
  resizeMode?: 'cover' | 'contain' | 'stretch' | 'center';
  loadingComponent?: React.ReactNode;
  onLoad?: () => void;
  onError?: (error: NativeSyntheticEvent<ImageErrorEventData>) => void;
  onCustomError?: (error: Error) => void;
  priority?: 'low' | 'normal' | 'high';
  onVisibilityChange?: (isVisible: boolean) => void;
  cullingDistance?: number;
  fade?: boolean;
  blurRadius?: number;
}

const LazyImage: React.FC<LazyImageProps> = ({
  source,
  style,
  placeholderColor = '#f0f0f0',
  placeholderSource,
  fallbackSource,
  resizeMode = 'cover',
  loadingComponent,
  onLoad,
  onError,
  onCustomError,
  priority = 'normal',
  onVisibilityChange,
  cullingDistance = 1000,
  fade = false,
  blurRadius = 5,
  ...props
}) => {
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);
  const [isVisible, setIsVisible] = useState<boolean>(false);
  const [opacityValue, setOpacityValue] = useState<number>(1);
  const [layout, setLayout] = useState({ x: 0, y: 0, width: 0, height: 0 });
  const imageRef = useRef<View>(null);
  const checkVisibilityIntervalRef = useRef<number | null>(null);
  const [isIntersecting, setIsIntersecting] = useState(false);
  const intersectionObserver = useRef<number | null>(null);

  const opacity = useMemo(() => {
    if (!fade) return 1; 
    const value = Number(opacityValue);
    return isNaN(value) ? 1 : Math.max(0.1, Math.min(1, value));
  }, [fade, opacityValue]);

  useEffect(() => {
    loadImage();
    if (fade) {
      startIntersectionObserver();
    }

    return () => {
      if (intersectionObserver.current !== null) {
        cancelAnimationFrame(intersectionObserver.current);
      }
      if (checkVisibilityIntervalRef.current !== null) {
        clearInterval(checkVisibilityIntervalRef.current);
      }
    };
  }, [source, fade]);

  useEffect(() => {
    onVisibilityChange?.(isIntersecting);
  }, [isIntersecting, onVisibilityChange]);

  const loadImage = async () => {
    try {
      if (typeof source === 'number') {
        setImageUri(Image.resolveAssetSource(source).uri);
        setLoading(false);
        onLoad?.();
      } else if (typeof source === 'object' && 'uri' in source) {
        const uri = source.uri;
        if (uri) {
          const cachedUri = await getCachedImage(uri);
          if (cachedUri) {
            const fileExists = await RNFS.exists(cachedUri);
            if (fileExists) {
              setImageUri(`file://${cachedUri}`);
              setLoading(false);
              onLoad?.();
            } else {
              throw new Error('Cached file does not exist');
            }
          } else {
            const downloadedUri = await downloadQueue.enqueue(uri, priority);
            setImageUri(`file://${downloadedUri}`);
            setLoading(false);
            onLoad?.();
          }
        }
      } else {
        throw new Error('Invalid source type');
      }
    } catch (error) {
      setLoading(false);
      setError(error instanceof Error ? error : new Error('Unknown error'));
      onCustomError?.(error instanceof Error ? error : new Error('Unknown error'));
    }
  };

  const checkIntersection = () => {
    if (imageRef.current) {
      const nodeHandle = findNodeHandle(imageRef.current);
      if (nodeHandle) {
        UIManager.measure(nodeHandle, (x, y, width, height, pageX, pageY) => {
          const windowHeight = Dimensions.get('window').height;
          const windowWidth = Dimensions.get('window').width;

          const isVisible =
            pageY < windowHeight &&
            pageY + height > 0 &&
            pageX < windowWidth &&
            pageX + width > 0;

          let visibleHeight = Math.min(windowHeight, pageY + height) - Math.max(pageY, 0);
          let visiblePercentage = Math.max(0, Math.min(1, visibleHeight / height));

          if (Platform.OS === 'ios') {
            const visibleHeightIOS =
              Math.min(windowHeight - pageY, height) - Math.max(0, -pageY);
            visiblePercentage = Math.max(0, Math.min(1, visibleHeightIOS / height));
          }

          setOpacityValue(visiblePercentage);
          setIsIntersecting(isVisible);
        });
      }
    }
    intersectionObserver.current = requestAnimationFrame(checkIntersection);
  };

  const startIntersectionObserver = () => {
    if (intersectionObserver.current !== null) {
      cancelAnimationFrame(intersectionObserver.current);
    }
    intersectionObserver.current = requestAnimationFrame(checkIntersection);
  };

  const startVisibilityCheck = () => {
    if (!fade) return; 

    checkVisibility();

    if (checkVisibilityIntervalRef.current !== null) {
      clearInterval(checkVisibilityIntervalRef.current);
    }

    checkVisibilityIntervalRef.current = setInterval(() => {
      requestAnimationFrame(checkVisibility);
    }, 100) as unknown as number;
  };

  const checkVisibility = () => {
    if (imageRef.current && fade) { 
      const nodeHandle = findNodeHandle(imageRef.current);
      if (nodeHandle) {
        UIManager.measure(nodeHandle, (x, y, width, height, pageX, pageY) => {
          const windowHeight = Dimensions.get('window').height;
          const windowWidth = Dimensions.get('window').width;

          const isVisible =
            pageY < windowHeight &&
            pageY + height > 0 &&
            pageX < windowWidth &&
            pageX + width > 0;

          let visibleHeight = Math.min(windowHeight, pageY + height) - Math.max(pageY, 0);
          let visiblePercentage = Math.max(0, Math.min(1, visibleHeight / height));

          if (Platform.OS === 'ios') {
            
            const visibleHeightIOS =
              Math.min(windowHeight - pageY, height) - Math.max(0, -pageY);
            visiblePercentage = Math.max(0, Math.min(1, visibleHeightIOS / height));
          }

          setOpacityValue(visiblePercentage);
          setIsVisible(isVisible);
        });
      }
    }
  };

  return (
    <View style={style} ref={imageRef} onLayout={(event) => {
      const { x, y, width, height } = event.nativeEvent.layout;
      setLayout({ x, y, width, height });
    }}>
      {loading ? (
        <Image
          source={typeof source === 'number' ? source : { uri: (source as { uri: string }).uri }}
          style={[StyleSheet.absoluteFill, style]}
          blurRadius={blurRadius}
          resizeMode={resizeMode}
        />
      ) : error ? (
        fallbackSource ? (
          <Image source={fallbackSource} style={style} resizeMode={resizeMode} {...props} />
        ) : (
          <View
            style={[
              style,
              { backgroundColor: 'red', justifyContent: 'center', alignItems: 'center' },
            ]}
          />
        )
      ) : (
        <Image
          source={{ uri: imageUri || (typeof source === 'object' && 'uri' in source ? source.uri : undefined) }}
          style={[style, { opacity }]}
          resizeMode={resizeMode}
          onError={(e) => {
            onError?.(e);
          }}
          {...props}
        />
      )}
      {loading && (
        <View
          style={[
            StyleSheet.absoluteFill,
            {
              backgroundColor: 'rgba(0,0,0,0.3)',
              justifyContent: 'center',
              alignItems: 'center',
            },
          ]}
        >
          {loadingComponent || <ActivityIndicator size="small" color="#fff" />}
        </View>
      )}
    </View>
  );
};

export default LazyImage;